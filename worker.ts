// worker.ts
// ---------------------------------------------------------------------
// Custom Worker entry point.
//
// The OpenNext Cloudflare adapter generates .open-next/worker.js which
// only exports a `fetch` handler. To run scheduled (cron) work we wrap
// that generated handler and add a `scheduled` handler, per the OpenNext
// "custom worker" pattern.
//
// The scheduled handler drives the same /api/fetch-news route the manual
// refresh button uses (which also chains embedding via drainEmbeddings
// and records last_fetch_at), so manual and automatic fetches share one
// code path.
//
// Cadence: cron fires every 2 hours, but we SKIP if the last fetch was
// under 2 hours ago — so a manual refresh resets the clock and no
// redundant automatic fetch runs right after it.
// ---------------------------------------------------------------------

// @ts-expect-error `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

// Hardcoded production origin for self-fetch from the scheduled handler
// (scheduled events have no request URL). Change here if the domain moves.
const SELF_ORIGIN = "https://cloudflare-news-platform.shefutech.workers.dev";

// Minimum gap between fetches. A manual refresh writes last_fetch_at too,
// so this also suppresses an automatic fetch right after a manual one.
const MIN_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours

interface Env {
  DB: {
    prepare: (q: string) => {
      first: () => Promise<{ value: string } | null>;
    };
  };
}

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
      ).first();
      if (row?.value) lastMs = Date.parse(row.value) || 0;
    } catch {
      // If we can't read it, err on the side of fetching.
      lastMs = 0;
    }

    // 2. Skip if the last fetch was under the minimum gap ago.
    const sinceMs = Date.now() - lastMs;
    if (lastMs && sinceMs < MIN_GAP_MS) {
      console.log(
        `[cron] Skip: last fetch ${Math.round(sinceMs / 60000)}m ago (< 120m).`,
      );
      return;
    }

    // 3. Run the same fetch pipeline the manual button uses. fetch-news
    //    records last_fetch_at and kicks off embedding on its own.
    console.log("[cron] Running scheduled fetch…");
    const res = await fetch(`${SELF_ORIGIN}/api/fetch-news`, { method: "POST" });
    const body = await res.text();
    console.log(`[cron] fetch-news → ${res.status} ${body.slice(0, 200)}`);

    // 4. Also refresh the ransomware victim list (separate endpoint,
    //    separate data source). Pulls the recent window; the route
    //    upserts so re-runs are idempotent.
    try {
      const rw = await fetch(`${SELF_ORIGIN}/api/ransomware-fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: 1 }),
      });
      const rwBody = await rw.text();
      console.log(`[cron] ransomware-fetch → ${rw.status} ${rwBody.slice(0, 200)}`);
    } catch (e) {
      console.error("[cron] ransomware-fetch failed:", e);
    }
  } catch (e) {
    console.error("[cron] scheduled fetch failed:", e);
  }
}
