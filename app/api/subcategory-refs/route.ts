// app/api/subcategory-refs/route.ts
// ---------------------------------------------------------------------
// Phase 2-A setup: (re)generate the subcategory reference vectors from
// the bilingual prototypes and store them in rag_config. Run once before
// enabling embedding-based subcategory classification, and again whenever
// you edit the prototypes in lib/fetcher/subcategory-embed.ts.
//
//   curl -X POST https://<worker>/api/subcategory-refs
//
// GET returns whether references are currently present.
// ---------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadRuntimeConfig } from "@/lib/rag/config";
import { generateSubcategoryRefs, loadSubcategoryRefs } from "@/lib/fetcher/subcategory-embed";
import type { Env } from "@/lib/types";

export async function POST(): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const cfg = await loadRuntimeConfig(env);

  try {
    const result = await generateSubcategoryRefs(env, cfg);
    return NextResponse.json({
      ok: true,
      generated: result,
      model: cfg.embeddingModel,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const refs = await loadSubcategoryRefs(env);
  return NextResponse.json({
    present: refs !== null,
    labels: refs ? Object.keys(refs) : [],
    dims: refs ? Object.values(refs)[0]?.length ?? 0 : 0,
  });
}
