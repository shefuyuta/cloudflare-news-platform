// app/api/technique-refs/route.ts
// ---------------------------------------------------------------------
// (Re)generate the AI attack-technique reference vectors and store them
// in rag_config. Run once before enabling technique classification, and
// again whenever the prototypes in lib/fetcher/technique-embed.ts change.
//
//   Invoke-RestMethod -Uri https://<worker>/api/technique-refs -Method Post
//     -Headers @{Authorization="Bearer <ADMIN_TOKEN>"}
//
// GET returns whether references are currently present (no auth needed —
// it's a read-only status check, same posture as /api/subcategory-refs GET).
// ---------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadRuntimeConfig } from "@/lib/rag/config";
import { generateTechniqueRefs, loadTechniqueRefs } from "@/lib/fetcher/technique-embed";
import type { Env } from "@/lib/types";

export async function POST(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;

  if (!env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "admin endpoint not configured" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cfg = await loadRuntimeConfig(env);
  try {
    const result = await generateTechniqueRefs(env, cfg);
    return NextResponse.json({ ok: true, generated: result, model: cfg.embeddingModel });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  const refs = await loadTechniqueRefs(env);
  return NextResponse.json({
    present: refs !== null,
    labels: refs ? Object.keys(refs) : [],
    dims: refs ? Object.values(refs)[0]?.length ?? 0 : 0,
  });
}
