// app/api/ransomware-fetch/route.ts
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  fetchRecentVictims, fetchVictimsByMonth, isJapan, extractUid,
} from "@/lib/ransomware";
import type { RansomwareVictim } from "@/lib/ransomware";
import type { Env } from "@/lib/types";

/** Use Workers AI to batch-translate company names to Japanese. */
async function translateToJapanese(env: Env, names: string[]): Promise<Record<string, string>> {
  if (!names.length) return {};
  const ai = env.AI as { run: (model: string, opts: object) => Promise<{ response: string }> };

  // Build a single prompt to translate all names at once
  const prompt = `以下は日本の企業・組織の英語名リストです。各名前について、日本語の正式名称または一般的な呼称を返してください。
不明な場合はカタカナ読みで構いません。必ず以下のJSON形式のみで返答してください（他のテキスト不要）：
{"訳": ["日本語名1", "日本語名2", ...]}

英語名リスト:
${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;

  try {
    const resp = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
    });
    const raw  = resp?.response?.trim() ?? "";
    // Extract JSON from response
    const match = raw.match(/\{[^}]*"訳"\s*:\s*\[[^\]]*\][^}]*\}/s);
    if (!match) return {};
    const parsed = JSON.parse(match[0]) as { 訳: string[] };
    const result: Record<string, string> = {};
    names.forEach((name, i) => {
      if (parsed.訳[i] && parsed.訳[i] !== name) {
        result[name] = parsed.訳[i];
      }
    });
    return result;
  } catch {
    return {};
  }
}

export async function POST(req: Request): Promise<Response> {
  const env     = (await getCloudflareContext()).env as unknown as Env;
  const { months = 6 } = await req.json().catch(() => ({})) as { months?: number };
  const now     = new Date();
  const errors: string[] = [];

  // ── Fetch from ransomware.live ─────────────────────────────────────
  let allVictims: RansomwareVictim[] = [];
  try {
    allVictims = await fetchRecentVictims();
  } catch (e) { errors.push(`recentvictims: ${e}`); }

  for (let i = 0; i < Math.min(months, 6); i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    try {
      const monthly = await fetchVictimsByMonth(d.getFullYear(), d.getMonth() + 1);
      allVictims = allVictims.concat(monthly);
    } catch (e) { errors.push(`monthly ${d.getFullYear()}/${d.getMonth() + 1}: ${e}`); }
  }

  // ── Filter Japan, deduplicate ──────────────────────────────────────
  const seen  = new Set<string>();
  const japan = allVictims.filter(v => {
    const uid = extractUid(v.post_url);
    if (!uid || seen.has(uid)) return false;
    seen.add(uid);
    return isJapan(v.country);
  });

  if (!japan.length) {
    return NextResponse.json({ upserted: 0, total_japan: 0, scanned: allVictims.length, errors });
  }

  // ── Translate victim names to Japanese (batch, for new entries only) ─
  // Check which UIDs already have victim_ja
  const newVictims = japan; // translate all to keep fresh
  const uniqueNames = [...new Set(newVictims.map(v => v.post_title).filter(Boolean))];

  // Translate in batches of 10 to stay within token limits
  const jaMap: Record<string, string> = {};
  const BATCH = 10;
  for (let i = 0; i < uniqueNames.length; i += BATCH) {
    const chunk = uniqueNames.slice(i, i + BATCH);
    try {
      const translated = await translateToJapanese(env, chunk);
      Object.assign(jaMap, translated);
    } catch { /* non-fatal */ }
  }

  // ── Upsert to D1 ──────────────────────────────────────────────────
  const fetchedAt = now.toISOString();
  let upserted = 0;

  for (const v of japan) {
    const uid   = extractUid(v.post_url);
    const jaName = jaMap[v.post_title] ?? null;
    try {
      await env.DB.prepare(`
        INSERT INTO ransomware_victims
          (id, victim, victim_ja, group_name, country, activity, website,
           description, post_url, discovered, published, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          victim=excluded.victim,
          victim_ja=COALESCE(excluded.victim_ja, victim_ja),
          group_name=excluded.group_name,
          country=excluded.country,
          description=excluded.description,
          fetched_at=excluded.fetched_at
      `).bind(
        uid,
        v.post_title  ?? "",
        jaName,
        v.group_name  ?? "",
        v.country     ?? "JP",
        v.activity    ?? "",
        v.website     ?? "",
        v.description ?? "",
        v.post_url    ?? "",
        v.discovered  ?? "",
        v.published   ?? "",
        fetchedAt,
      ).run();
      upserted++;
    } catch (e) { errors.push(`upsert ${uid}: ${e}`); }
  }

  return NextResponse.json({
    upserted,
    total_japan:  japan.length,
    scanned:      allVictims.length,
    translated:   Object.keys(jaMap).length,
    sample_trans: Object.entries(jaMap).slice(0, 3),
    errors:       errors.length ? errors.slice(0, 5) : undefined,
  });
}
