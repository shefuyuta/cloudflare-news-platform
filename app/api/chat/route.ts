// app/api/chat/route.ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { streamChat } from "@/lib/rag/chat";
import type { Env, ChatRequest } from "@/lib/types";

export const runtime = "edge";

export async function POST(req: Request): Promise<Response> {
  const env = getRequestContext().env as unknown as Env;
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

  // Hard guard on payload size — keep history short.
  if ((body.history?.length ?? 0) > 20) {
    body.history = body.history!.slice(-20);
  }

  return streamChat(env, body);
}
