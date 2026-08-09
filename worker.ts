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
// Cadence (four cron schedules, dispatched by event.cron):
//   "0 */2 * * *"  — news: runFetchNews (every 2h at :00)
//   "3 */2 * * *"  — ransomware: runRansomwareFetch (every 2h at :03)
//   "2 * * * *"    — embed: runEmbedMissing every hour at :02 (steady drain)
//   "5 */2 * * *"  — embed: runEmbedMissing again at :05 on even hours
// Each pipeline runs in a SEPARATE invocation with its own ~1000-subrequest
// budget. Running them together exhausted it: fetch + a 20-round embed loop
// starved each other ("Too many subrequests"), and ransomware fetched right
// after fetch-news came back scanned:0. Isolated invocations fix both. No
// skip/gap logic: fetch-news is idempotent (ON CONFLICT upserts).
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
    event: { cron?: string },
    env: Env,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
  ): Promise<void> {
    // Dispatch by which schedule fired. The fetch schedule ("0 */2") runs
    // the ingest pipelines; the two embed schedules ("2 * * * *" hourly and
    // "5 */2" post-fetch) each run only the embed drain in their own
    // invocation, so they never share a subrequest budget with fetch.
    if (event.cron === "0 */2 * * *") {
      ctx.waitUntil(runNewsFetch(env));
    } else if (event.cron === "3 */2 * * *") {
      ctx.waitUntil(runRansomwarePass(env));
    } else {
      // "2 * * * *" or "5 */2 * * *" — both are embed passes.
      ctx.waitUntil(runEmbedPass(env));
    }
  },
} satisfies ExportedHandler<Env>;

/** News ingest ONLY. Its own invocation: ~30s + ~90 subrequests fetching
 *  ~45 feeds, kept away from ransomware/embed so nothing shares a budget. */
async function runNewsFetch(env: Env): Promise<void> {
  try {
    console.log("[cron] Running fetch pipeline directly…");
    const result = await runFetchNews(env);
    console.log(`[cron] fetch-news -> ingested ${result.ingested}, errors ${result.errors}, ${result.elapsed}`);
  } catch (e) {
    console.error("[cron] fetch-news failed:", e);
  }
}

/** Ransomware victim refresh ONLY, in its own invocation.
 *  Previously this ran right after fetch-news in the SAME invocation and
 *  came back scanned:0 — fetch-news' ~30s + in-flight subrequests starved
 *  the ransomware.live fetches (the same run succeeded when called alone via
 *  the API route). Isolating it restores the clean single-purpose fetch. */
async function runRansomwarePass(env: Env): Promise<void> {
  try {
    const rw = await runRansomwareFetch(env, 1);
    console.log(`[cron] ransomware-fetch -> upserted ${rw.upserted}, total ${rw.total}, scanned ${rw.scanned}`);
  } catch (e) {
    console.error("[cron] ransomware-fetch failed:", e);
  }
}

/** Embed pass: drain the embedding backlog in its own invocation. */
async function runEmbedPass(env: Env): Promise<void> {
  try {
    // MAX_ROUNDS bounds one invocation's work. At ~200 articles/round and
    // ~17 subrequests/round, 8 rounds = up to 1600 articles for ~136
    // subrequests — comfortably inside the ~1000 budget with headroom, and
    // more than enough for a normal backlog. Anything beyond is picked up
    // by the next hourly embed pass.
    const MAX_ROUNDS = 8;
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
}
