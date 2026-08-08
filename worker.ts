// worker.ts
// ---------------------------------------------------------------------
// Custom Worker entry point.
//
// The OpenNext Cloudflare adapter generates .open-next/worker.js which
// only exports a `fetch` handler. To run scheduled (cron) work we wrap
// that generated handler and add a `scheduled` handler.
//
// IMPORTANT: the scheduled handler calls each pipeline step DIRECTLY
// (runFetchNews / runRansomwareFetch / runEmbedMissing) rather than
// self-fetching its own HTTP routes. A scheduled handler cannot wait for
// a self-request to complete — the invocation context closes before the
// sub-request finishes, so the route never really ran (observed as ~2ms
// CPU time per cron event). Calling the pipeline functions directly
// keeps all the work inside this one invocation.
//
// Cadence: cron fires every 2 hours, but we SKIP if the last fetch was
// under 2 hours ago — so a manual refresh resets the clock and no
// redundant automatic fetch runs right after it.
// ---------------------------------------------------------------------

// @ts-expect-error `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";
import { runFetchNews } from "./lib/pipeline/fetch-news";
import { runRansomwareFetch } from "./lib/pipeline/ransomware-fetch";
import { runEmbedMissing } from "./lib/pipeline/embed-missing";
import type { Env } from "./lib/types";

// Minimum gap between fetches. A manual refresh writes last_fetch_at too,
// so this also suppresses an automatic fetch right after a manual one.
const MIN_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours

export default {
  fetch: handler.fetch,

  async scheduled(
    _event: unknown,
    env: Env,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
  ): Promise<void> {
    ctx.waitUntil(runScheduledFetch(env));
  },
} satisfies ExportedHandler<Env>;

async function runScheduledFetch(env: Env): Promise<void> {
  try {
    // 1. Check when we last fetched (manual OR cron both write this).
    let lastMs = 0;
    try {
      const row = await env.DB.prepare(
        "SELECT value FROM rag_config WHERE key = 'last_fetch_at'",
      ).first() as { value: string } | null;
      if (row?.value) lastMs = Date.parse(row.value) || 0;
    } catch {
      lastMs = 0; // If we can't read it, err on the side of fetching.
    }

    // 2. Decide whether to run the FETCH pipelines. We skip them if the
    //    last fetch was under the minimum gap ago (a manual refresh also
    //    writes last_fetch_at, so this suppresses a redundant auto-fetch).
    //    NOTE: embed-missing (step 5) runs REGARDLESS of this skip — it is
    //    idempotent (only touches vector_id IS NULL rows) and near-free when
    //    there's nothing to embed, so running it every cron drains any
    //    backlog roughly twice as fast without waiting on the fetch cadence.
    const sinceMs = Date.now() - lastMs;
    const skipFetch = Boolean(lastMs) && sinceMs < MIN_GAP_MS;

    if (skipFetch) {
      console.log(`[cron] Skip fetch: last fetch ${Math.round(sinceMs / 60000)}m ago (< 120m). Embed still runs.`);
    } else {
      // 3. Run the fetch pipeline DIRECTLY (no self-fetch). This writes
      //    last_fetch_at and ingests all sources in this same invocation.
      console.log("[cron] Running fetch pipeline directly…");
      const result = await runFetchNews(env);
      console.log(`[cron] fetch-news -> ingested ${result.ingested}, errors ${result.errors}, ${result.elapsed}`);

      // 4. Refresh the ransomware victim list DIRECTLY (no self-fetch).
      try {
        const rw = await runRansomwareFetch(env, 1);
        console.log(`[cron] ransomware-fetch -> upserted ${rw.upserted}, total ${rw.total}, scanned ${rw.scanned}`);
      } catch (e) {
        console.error("[cron] ransomware-fetch failed:", e);
      }
    }

    // 5. Drain the embedding backlog DIRECTLY (no self-fetch), looping
    //    until nothing remains. Runs EVERY cron (see note above). Each
    //    call embeds up to MAX_PER_RUN; if there's nothing to do it returns
    //    almost immediately with remaining=0.
    try {
      const MAX_ROUNDS = 20;
      let totalEmbedded = 0;
      for (let i = 0; i < MAX_ROUNDS; i++) {
        const data = await runEmbedMissing(env);
        totalEmbedded += data.embedded ?? 0;
        if ((data.remaining ?? 0) <= 0) break;
      }
      console.log(`[cron] embed-missing done -> embedded ${totalEmbedded}`);
    } catch (e) {
      console.error("[cron] embed-missing failed:", e);
    }
  } catch (e) {
    console.error("[cron] scheduled run failed:", e);
  }
}
