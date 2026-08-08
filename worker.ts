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
// Cadence: cron fires every 2 hours and runs everything each time — no
// skip/gap logic. fetch-news is idempotent (ON CONFLICT upserts), so a
// manual refresh landing near a cron just harmlessly re-fetches; that's
// cheaper than skipping a scheduled run and leaving data stale.
// ---------------------------------------------------------------------

// @ts-expect-error `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";
import { runFetchNews } from "./lib/pipeline/fetch-news";
import { runRansomwareFetch } from "./lib/pipeline/ransomware-fetch";
import { runEmbedMissing } from "./lib/pipeline/embed-missing";
import type { Env } from "./lib/types";

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
    // No skip / gap logic: the cron cadence (every 2h) IS the fetch cadence.
    // fetch-news is idempotent (ON CONFLICT(url) upserts), so even a manual
    // refresh landing right before a cron just re-fetches the same feeds
    // harmlessly — cheaper to accept that than to skip a scheduled run.

    // 1. Run the fetch pipeline DIRECTLY (no self-fetch). This writes
    //    last_fetch_at and ingests all sources in this same invocation.
    console.log("[cron] Running fetch pipeline directly…");
    const result = await runFetchNews(env);
    console.log(`[cron] fetch-news -> ingested ${result.ingested}, errors ${result.errors}, ${result.elapsed}`);

    // 2. Refresh the ransomware victim list DIRECTLY (no self-fetch).
    try {
      const rw = await runRansomwareFetch(env, 1);
      console.log(`[cron] ransomware-fetch -> upserted ${rw.upserted}, total ${rw.total}, scanned ${rw.scanned}`);
    } catch (e) {
      console.error("[cron] ransomware-fetch failed:", e);
    }

    // 3. Drain the embedding backlog DIRECTLY (no self-fetch), looping
    //    until nothing remains. Each call embeds up to MAX_PER_RUN; if
    //    there's nothing to do it returns almost immediately (remaining=0).
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
