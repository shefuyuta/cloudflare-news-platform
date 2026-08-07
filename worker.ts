// worker.ts
// ---------------------------------------------------------------------
// Custom Worker entry point.
//
// The OpenNext Cloudflare adapter generates .open-next/worker.js which
// only exports a `fetch` handler. To run scheduled (cron) work we wrap
// that generated handler and add a `scheduled` handler.
//
// IMPORTANT: the scheduled handler calls the fetch pipeline DIRECTLY
// (runFetchNews(env)) rather than self-fetching its own HTTP route. A
// scheduled handler cannot wait for a self-request to complete — the
// invocation context closes before the sub-request finishes, so the
// route never really ran and last_fetch_at never updated from cron
// (observed as ~2ms CPU time per cron event). Calling the pipeline
// function directly keeps all the work inside this one invocation.
//
// Cadence: cron fires every 2 hours, but we SKIP if the last fetch was
// under 2 hours ago — so a manual refresh resets the clock and no
// redundant automatic fetch runs right after it.
// ---------------------------------------------------------------------

// @ts-expect-error `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";
import { runFetchNews } from "./lib/pipeline/fetch-news";
import type { Env } from "./lib/types";

// Secondary steps are still self-fetched (not yet extracted to shared
// modules). The critical last_fetch_at write lives in runFetchNews.
const SELF_ORIGIN = "https://cloudflare-news-platform.shefutech.workers.dev";

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

    // 2. Skip if the last fetch was under the minimum gap ago.
    const sinceMs = Date.now() - lastMs;
    if (lastMs && sinceMs < MIN_GAP_MS) {
      console.log(`[cron] Skip: last fetch ${Math.round(sinceMs / 60000)}m ago (< 120m).`);
      return;
    }

    // 3. Run the fetch pipeline DIRECTLY (no self-fetch). This writes
    //    last_fetch_at and ingests all sources in this same invocation.
    console.log("[cron] Running fetch pipeline directly…");
    const result = await runFetchNews(env);
    console.log(`[cron] fetch-news -> ingested ${result.ingested}, errors ${result.errors}, ${result.elapsed}`);

    // 4. Refresh the ransomware victim list (still via self-fetch for now).
    try {
      const rw = await fetch(`${SELF_ORIGIN}/api/ransomware-fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: 1 }),
      });
      const rwBody = await rw.text();
      console.log(`[cron] ransomware-fetch -> ${rw.status} ${rwBody.slice(0, 200)}`);
    } catch (e) {
      console.error("[cron] ransomware-fetch failed:", e);
    }

    // 5. Drain the embedding backlog (still via self-fetch for now). Each
    //    response body is read so there's no stalled-response deadlock.
    try {
      const MAX_ROUNDS = 20;
      let totalEmbedded = 0;
      for (let i = 0; i < MAX_ROUNDS; i++) {
        const em = await fetch(`${SELF_ORIGIN}/api/embed-missing`, { method: "POST" });
        if (!em.ok) { console.warn(`[cron] embed-missing -> ${em.status}`); break; }
        const data = await em.json() as { embedded?: number; remaining?: number };
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
