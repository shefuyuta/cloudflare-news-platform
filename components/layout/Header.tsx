// components/layout/Header.tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { useLang } from "@/components/LangProvider";

const TIME_RANGES = [
  { hours: 24,  key: "hours24" as const },
  { hours: 48,  key: "hours48" as const },
  { hours: 72,  key: "hours72" as const },
  { hours: 168, key: "week1"   as const },
];

export function Header() {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const { lang, toggle, t } = useLang();
  const [val, setVal] = useState(params.get("q") ?? "");

  const currentHours = parseInt(params.get("hours") ?? "24", 10);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams(params);
    if (val.trim()) sp.set("q", val.trim()); else sp.delete("q");
    router.push(`${pathname}?${sp.toString()}`);
  }

  function setTimeRange(hours: number) {
    const sp = new URLSearchParams(params);
    if (hours === 24) sp.delete("hours"); else sp.set("hours", String(hours));
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <header className="sticky top-0 z-20 bg-[var(--bg)]/85 backdrop-blur-md border-b hairline">
      <div className="max-w-6xl mx-auto px-6 md:px-10 h-14 flex items-center gap-4">
        {/* Search ---------------------------------------------------- */}
        <form onSubmit={submit} className="flex-1 max-w-md">
          <input
            value={val}
            onChange={e => setVal(e.target.value)}
            type="search"
            placeholder={t("searchPlaceholder")}
            className="w-full bg-transparent text-sm py-2 border-b hairline focus:border-[var(--ink)] outline-none placeholder:text-[var(--ink-4)]"
          />
        </form>

        {/* Time range ------------------------------------------------ */}
        <div className="hidden sm:flex items-center gap-0.5">
          {TIME_RANGES.map(tr => (
            <button
              key={tr.hours}
              onClick={() => setTimeRange(tr.hours)}
              className={[
                "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                currentHours === tr.hours
                  ? "bg-[var(--ink)] text-white"
                  : "text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
              ].join(" ")}
            >
              {t(tr.key)}
            </button>
          ))}
        </div>

        {/* Lang toggle ----------------------------------------------- */}
        <button
          onClick={toggle}
          className="px-2.5 py-1 text-[11px] font-mono font-medium rounded-md ring-1 ring-inset ring-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors"
          title={lang === "ja" ? "Switch to English" : "日本語に切替"}
        >
          {lang === "ja" ? "EN" : "JA"}
        </button>

        {/* Date ------------------------------------------------------ */}
        <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] hidden lg:block">
          {new Date().toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
            weekday: "short", month: "short", day: "numeric",
          })}
        </span>
      </div>
    </header>
  );
}
