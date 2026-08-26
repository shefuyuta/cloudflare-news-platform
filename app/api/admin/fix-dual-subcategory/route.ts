// app/api/admin/fix-dual-subcategory/route.ts
// ---------------------------------------------------------------------
// One-time cleanup for articles left with BOTH sub:vulnerability and
// sub:incident tags — the data-side fallout of the bug fixed in
// embed-missing.ts (refineSubTags was being skipped whenever embedding
// classification returned an empty label set, leaving fetch-news.ts's
// keyword-based multi-label tags in place permanently).
//
// Re-uses the EXISTING Vectorize embedding for each affected article (no
// new embeddings generated — these articles are already embedded, that's
// how they got dual-tagged via the old refineSubTags skip in the first
// place) and re-runs classifyByEmbedding + refineSubTags, which is now
// unconditional and will correctly collapse each article to a single
// label (or none, i.e. "other").
//
// POST body: { limit?: number } — processes up to `limit` affected
// articles per call (default 50), so a few hundred articles can be
// cleared in a handful of calls without a single request running long
// enough to hit Workers' execution limits.
// ---------------------------------------------------------------------
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/types";
import { loadSubcategoryRefs, classifyByEmbedding } from "@/lib/fetcher/subcategory-embed";
import { loadSubThreshold } from "@/lib/pipeline/embed-missing";

export async function POST(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;

  if (!env.ADMIN_TOKEN) {
    return Response.json({ error: "admin endpoint not configured" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== env.ADMIN_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { limit?: number };
  try { body = await req.json(); } catch { body = {}; }
  const limit = Math.min(100, Math.max(1, body.limit ?? 50));

  const subRefs = await loadSubcategoryRefs(env);
  if (!subRefs) {
    return Response.json({ error: "subcategory reference vectors not found — run /api/subcategory-refs first" }, { status: 500 });
  }
  const threshold = await loadSubThreshold(env);

  // Find articles currently carrying BOTH sub:vulnerability and
  // sub:incident, oldest first (arbitrary, just for stable pagination
  // across calls).
  const dualRows = await env.DB.prepare(`
    SELECT a.id, a.vector_id
    FROM articles a
    JOIN article_tags at1 ON at1.article_id = a.id
    JOIN tags t1 ON t1.id = at1.tag_id AND t1.name = 'sub:vulnerability'
    JOIN article_tags at2 ON at2.article_id = a.id
    JOIN tags t2 ON t2.id = at2.tag_id AND t2.name = 'sub:incident'
    WHERE a.vector_id IS NOT NULL
    ORDER BY a.id
    LIMIT ?
  `).bind(limit).all();

  const targets = (dualRows.results ?? []) as { id: string; vector_id: string }[];
  if (!targets.length) {
    return Response.json({ ok: true, processed: 0, remaining: 0, message: "no dual-tagged articles found" });
  }

  // Fetch each article's existing embedding from Vectorize by its stored
  // vector_id — no new embeddings generated.
  const vecResult = await env.VECTORIZE.getByIds(targets.map(t => t.vector_id));
  const vecById = new Map(vecResult.map(v => [v.id, Array.from(v.values) as number[]]));

  let fixed = 0;
  let skippedNoVector = 0;
  const results: { id: string; labels: string[] }[] = [];

  for (const t of targets) {
    const vector = vecById.get(t.vector_id);
    if (!vector) { skippedNoVector++; continue; }
    const labels = classifyByEmbedding(vector, subRefs, threshold);

    // Inline version of refineSubTags (kept local rather than importing
    // the unexported helper from embed-missing.ts): replace sub:* tags
    // with the freshly-computed single-label (or empty) set, preserving
    // every other tag on the article.
    const existing = await env.DB.prepare(`
      SELECT t.name AS name FROM article_tags at JOIN tags t ON at.tag_id = t.id WHERE at.article_id = ?
    `).bind(t.id).all();
    const currentNames = (existing.results ?? []).map(r => (r as { name: string }).name);
    const nonSub = currentNames.filter(n => !n.startsWith("sub:"));
    const newSub = labels.map(l => `sub:${l}`);
    const finalNames = [...new Set([...nonSub, ...newSub])];

    const tagIds: number[] = [];
    for (const name of finalNames) {
      await env.DB.prepare(`INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING`).bind(name).run();
      const row = await env.DB.prepare(`SELECT id FROM tags WHERE name = ?`).bind(name).first() as { id: number } | null;
      if (row) tagIds.push(row.id);
    }
    await env.DB.prepare(`DELETE FROM article_tags WHERE article_id = ?`).bind(t.id).run();
    for (const tagId of tagIds) {
      await env.DB.prepare(`INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)`).bind(t.id, tagId).run();
    }

    fixed++;
    results.push({ id: t.id, labels });
  }

  // How many are still left after this batch, for the caller to decide
  // whether to call again.
  const remainingRow = await env.DB.prepare(`
    SELECT COUNT(*) AS cnt FROM (
      SELECT a.id
      FROM articles a
      JOIN article_tags at1 ON at1.article_id = a.id
      JOIN tags t1 ON t1.id = at1.tag_id AND t1.name = 'sub:vulnerability'
      JOIN article_tags at2 ON at2.article_id = a.id
      JOIN tags t2 ON t2.id = at2.tag_id AND t2.name = 'sub:incident'
    )
  `).first() as { cnt: number } | null;

  return Response.json({
    ok: true,
    processed: targets.length,
    fixed,
    skippedNoVector,
    remaining: remainingRow?.cnt ?? 0,
    sample: results.slice(0, 10),
  });
}
