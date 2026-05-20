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
    hoursAgo:    parseInt(params.get("hours") ?? "24", 10),
  };
}

/** Category-aware quick question templates. */
function getTemplates(category: Category | undefined, lang: string) {
  if (lang === "ja") {
    if (category === "cybersecurity") return [
      "今週のCVEで最も深刻なものを教えて",
      "最近のランサムウェアインシデントをまとめて",
      "パッチを当てるべき脆弱性は？",
      "最新の脅威アクターの動向は？",
    ];
    if (category === "ai") return [
      "今週リリースされたAIモデルは？",
      "最新のAI安全性ニュースをまとめて",
      "各社のAI開発競争の状況は？",
      "政策・規制の最新動向を教えて",
    ];
    if (category === "general") return [
      "日本の主要ニュースをまとめて",
      "経済・市場の最新動向は？",
      "地政学的リスクの高い地域は？",
      "今日の重要ニュースTOP3を教えて",
    ];
    return [
      "本日のブリーフィングを教えて",
      "全カテゴリで最も重要なニュースは？",
      "日本に関連するニュースは？",
      "AIとサイバーセキュリティの最新情報は？",
    ];
  }
  // English
  if (category === "cybersecurity") return [
    "What are the most critical CVEs this week?",
    "Summarize the latest ransomware incidents",
    "Which vulnerabilities need immediate patching?",
    "What are the latest threat actor movements?",
  ];
  if (category === "ai") return [
    "What AI models were released this week?",
    "Summarize the latest AI safety news",
    "How is the AI race between companies evolving?",
    "What are the latest AI policy developments?",
  ];
  if (category === "general") return [
    "Brief me on Japan headlines today",
    "What are the latest economic trends?",
    "Which geopolitical regions are most at risk?",
    "Give me today's top 3 most important stories",
  ];
  return [
    "Give me today's top briefing",
    "What is the most important news across all categories?",
    "What news is relevant to Japan?",
    "Latest updates in AI and cybersecurity?",
  ];
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

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || pending) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", content: msg }]);
    setPending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId.current,
          message: msg,
          context: ctx,
          history: msgs.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        throw new Error(errText);
      }

      const data = await res.json() as { answer: string; citations: Citation[] };
      setMsgs(m => [...m, { role: "assistant", content: data.answer, citations: data.citations }]);
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
        <aside className="fixed bottom-6 right-6 z-30 w-[min(440px,calc(100vw-1.5rem))] h-[min(640px,calc(100vh-4rem))] bg-[var(--surface)] border hairline rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <ChatHeader ctx={ctx} onClose={() => setOpen(false)} />
          <div ref={scrollRef} className="flex-1 overflow-y-auto dock-scroll px-4 py-4 space-y-4">
            {msgs.length === 0 && (
              <EmptyState ctx={ctx} onTemplate={(q) => send(q)} />
            )}
            {msgs.map((m, i) => <ChatBubble key={i} msg={m} />)}
            {pending && (
              <div className="flex gap-1 text-[var(--ink-3)] text-xs px-1">
                <span className="dot">●</span><span className="dot">●</span><span className="dot">●</span>
              </div>
            )}
          </div>
          <ChatInput value={input} disabled={pending} onChange={setInput} onSend={() => send()} />
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
      <button onClick={onClose} aria-label="Close" className="text-[var(--ink-3)] hover:text-[var(--ink)] text-xl leading-none px-1">×</button>
    </header>
  );
}

function EmptyState({ ctx, onTemplate }: {
  ctx: ReturnType<typeof useViewContext>;
  onTemplate: (q: string) => void;
}) {
  const { t, lang } = useLang();
  const templates = getTemplates(ctx.category, lang);

  return (
    <div className="text-sm text-[var(--ink-3)] space-y-4 pt-2">
      <p>{t("chatEmpty")}</p>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-[var(--ink-4)] mb-2">
          {t("chatTemplates")}
        </p>
        <div className="space-y-1.5">
          {templates.map((q) => (
            <button
              key={q}
              onClick={() => onTemplate(q)}
              className="w-full text-left text-[12px] px-3 py-2 rounded-lg border hairline text-[var(--ink-2)] hover:bg-[var(--line-soft)] hover:text-[var(--ink)] transition-colors font-display italic"
            >
              "{q}"
            </button>
          ))}
        </div>
      </div>
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
