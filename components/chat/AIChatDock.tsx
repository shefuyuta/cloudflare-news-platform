// components/chat/AIChatDock.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Citation } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { useLang } from "@/components/LangProvider";

interface Msg {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

function useViewContext() {
  const pathname = usePathname();
  const params   = useSearchParams();

  const category: Category | undefined =
    pathname.startsWith("/general")       ? "general" :
    pathname.startsWith("/cybersecurity") ? "cybersecurity" :
    pathname.startsWith("/ai")            ? "ai" : undefined;

  return {
    category,
    region:      params.get("region")      ?? undefined,
    subcategory: params.get("subcategory") ?? undefined,
    tags:        params.getAll("tag"),
  };
}

export function AIChatDock() {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState("");
  const [msgs, setMsgs]       = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const sessionId             = useRef(crypto.randomUUID());
  const scrollRef             = useRef<HTMLDivElement>(null);
  const ctx                   = useViewContext();
  const { t }                 = useLang();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", content: text }]);
    setPending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId.current,
          message: text,
          context: ctx,
          history: msgs.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.body) throw new Error("No body");
      await consumeStream(res.body, setMsgs);
    } catch (e) {
      setMsgs(m => [...m, { role: "assistant", content: `Error: ${(e as Error).message}` }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          className="fixed bottom-6 right-6 z-30 h-12 px-5 rounded-full bg-[var(--ink)] text-white text-sm font-medium shadow-lg hover:bg-black transition-colors flex items-center gap-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {t("askNewsHub")}
        </button>
      )}

      {open && (
        <aside className="fixed bottom-6 right-6 z-30 w-[min(420px,calc(100vw-3rem))] h-[min(640px,calc(100vh-4rem))] bg-[var(--surface)] border hairline rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <ChatHeader ctx={ctx} onClose={() => setOpen(false)} />
          <div ref={scrollRef} className="flex-1 overflow-y-auto dock-scroll px-4 py-4 space-y-4">
            {msgs.length === 0 && <EmptyState ctx={ctx} />}
            {msgs.map((m, i) => <ChatBubble key={i} msg={m} />)}
            {pending && (
              <div className="flex gap-1 text-[var(--ink-3)] text-xs px-1">
                <span className="dot">●</span><span className="dot">●</span><span className="dot">●</span>
              </div>
            )}
          </div>
          <ChatInput value={input} disabled={pending} onChange={setInput} onSend={send} />
        </aside>
      )}
    </>
  );
}

function ChatHeader({ ctx, onClose }: { ctx: ReturnType<typeof useViewContext>; onClose: () => void }) {
  const { t } = useLang();
  const scope = [ctx.category, ctx.region, ctx.subcategory].filter(Boolean).join(" > ") || t("chatAllNews");
  return (
    <header className="px-4 py-3 border-b hairline flex items-center justify-between">
      <div>
        <div className="font-display text-sm font-semibold">{t("chatTitle")}</div>
        <div className="text-[11px] text-[var(--ink-3)] mt-0.5">
          {t("chatScope")}: <span className="font-mono">{scope}</span>
        </div>
      </div>
      <button onClick={onClose} aria-label="Close" className="text-[var(--ink-3)] hover:text-[var(--ink)] text-xl leading-none px-1">
        ×
      </button>
    </header>
  );
}

function EmptyState({ ctx }: { ctx: ReturnType<typeof useViewContext> }) {
  const { t } = useLang();
  const examples = ctx.category === "cybersecurity"
    ? ["Top exploited CVEs this week", "Latest ransomware incidents", "Summarize the most severe vulnerabilities"]
    : ctx.category === "ai"
    ? ["What model releases happened this week?", "Compare claims across the latest AI safety stories"]
    : ["Brief me on Japan headlines today", "What's the consensus on the latest geopolitical event?"];
  return (
    <div className="text-sm text-[var(--ink-3)] space-y-3 pt-2">
      <p>{t("chatEmpty")}</p>
      <ul className="space-y-1.5">
        {examples.map(e => <li key={e} className="font-display italic text-[var(--ink-2)]">"{e}"</li>)}
      </ul>
    </div>
  );
}

function ChatBubble({ msg }: { msg: Msg }) {
  const { t } = useLang();
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-[var(--ink)] text-white text-sm px-3 py-2 rounded-lg max-w-[85%] whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="text-sm leading-relaxed text-[var(--ink)] whitespace-pre-wrap">
      {msg.content}
      {msg.citations && msg.citations.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t hairline pt-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">{t("chatSources")}</div>
          {msg.citations.map((c, i) => (
            <a
              key={c.article_id}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[12px] text-[var(--ink-2)] hover:text-[var(--ink)]"
            >
              <span className="font-mono text-[var(--ink-3)]">[{i + 1}]</span>{" "}
              {c.title}{" "}
              <span className="text-[var(--ink-4)]">— {c.source}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatInput({ value, onChange, onSend, disabled }: {
  value: string; onChange: (s: string) => void; onSend: () => void; disabled: boolean;
}) {
  const { t } = useLang();
  return (
    <form
      onSubmit={e => { e.preventDefault(); onSend(); }}
      className="border-t hairline p-3 flex items-end gap-2"
    >
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
        }}
        rows={1}
        placeholder={t("chatPlaceholder")}
        className="flex-1 resize-none text-sm bg-transparent outline-none placeholder:text-[var(--ink-4)] max-h-28"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-[var(--ink)] text-white disabled:opacity-30"
      >
        {t("chatSend")}
      </button>
    </form>
  );
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>,
) {
  setMsgs(m => [...m, { role: "assistant", content: "" }]);

  const reader = body.getReader();
  const dec    = new TextDecoder();
  let buf      = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";

    for (const frame of frames) {
      const lines = frame.split("\n");
      let event = "message";
      let data  = "";
      for (const l of lines) {
        if (l.startsWith("event:")) event = l.slice(6).trim();
        else if (l.startsWith("data:")) data += l.slice(5).trim();
      }
      if (!data || data === "[DONE]") continue;

      if (event === "citations") {
        try {
          const cites = JSON.parse(data) as Citation[];
          setMsgs(m => {
            const last = m[m.length - 1];
            if (!last || last.role !== "assistant") return m;
            return [...m.slice(0, -1), { ...last, citations: cites }];
          });
        } catch { /* ignore malformed */ }
        continue;
      }

      try {
        const obj = JSON.parse(data) as { response?: string };
        if (obj.response) {
          setMsgs(m => {
            const last = m[m.length - 1];
            if (!last || last.role !== "assistant") return m;
            return [...m.slice(0, -1), { ...last, content: last.content + obj.response }];
          });
        }
      } catch { /* not JSON */ }
    }
  }
}
