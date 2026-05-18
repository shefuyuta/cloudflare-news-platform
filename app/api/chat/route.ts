// app/api/chat/route.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runChat } from "@/lib/rag/chat";
import type { Env, ChatRequest } from "@/lib/types";

export async function POST(req: Request): Promise<Response> {
  const env = (await getCloudflareContext()).env as unknown as Env;
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body?.message?.trim()) {
    return new Response("`message` is required", { status: 400 });
  }
  if (!body.session_id) {
    return new Response("`session_id` is required", { status: 400 });
  }

  if ((body.history?.length ?? 0) > 20) {
    body.history = body.history!.slice(-20);
  }

  return runChat(env, body);
}
