// components/layout/Header.tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useLang } from "@/components/LangProvider";
import { MobileDrawer } from "./MobileDrawer";
import { useAlertKeywords } from "@/hooks/useAlertKeywords";
import { Bell, RefreshCw, Menu, X, Sun, Moon, Monitor, Globe } from "@/components/ui/Icon";
import { useDarkMode } from "@/hooks/useDarkMode";

const TIME_RANGES = [
  { hours: 24,  key: "hours24" as const },
  { hours: 48,  key: "hours48" as const },
  { hours: 72,  key: "hours72" as const },
  { hours: 168, key: "week1"   as const },
];

export function Header({ initialLastFetch = "" }: { initialLastFetch?: string }) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const { lang, toggle, t } = useLang();
  const { theme, toggle: toggleTheme, mounted: themeMounted } = useDarkMode();
  const [val, setVal]           = useState(params.get("q") ?? "");
  const [fetching,     setFetching]     = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string>(initialLastFetch);

  // Server value (from rag_config, reflects manual + cron) is the source of
  // truth. Fall back to localStorage only if the server didn't provide one.
  useEffect(() => {
    if (initialLastFetch) { setLastFetchedAt(initialLastFetch); return; }
    const saved = localStorage.getItem("newshub-last-fetched");
    if (saved) setLastFetchedAt(saved);
  }, [initialLastFetch]);
  const [fetchResult, setFetchResult] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [alertOpen, setAlertOpen]     = useState(false);
  const alertRef                       = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!alertOpen) return;
    function handleClick(e: MouseEvent) {
      if (alertRef.current && !alertRef.current.contains(e.target as Node)) {
        setAlertOpen(false);
      }
    }
    // Delay so the opening click doesn't immediately close it
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 10);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handleClick); };
  }, [alertOpen]);
  const [alertInput, setAlertInput]   = useState("");

  const currentHours = parseInt(params.get("hours") ?? "24", 10);
  const { keywords, addKeyword, removeKeyword, mounted } = useAlertKeywords();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = val.trim();
    if (!q) return;
    // Always go to /search for full-database search
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function setTimeRange(hours: number) {
    const sp = new URLSearchParams(params);
    if (hours === 24) sp.delete("hours"); else sp.set("hours", String(hours));
    router.push(`${pathname}?${sp.toString()}`);
  }

  async function fetchNews() {
    if (fetching) return;
    setFetching(true);
    setFetchResult(lang === "ja" ? "記事を取得中…" : "Fetching…");
    try {
      const fetchRes  = await fetch("/api/fetch-news", { method: "POST" });
      const fetchData = await fetchRes.json() as { ingested: number; fetchedAt?: string };
      setFetchResult(lang === "ja" ? `${fetchData.ingested}件取得。AI処理中…` : `${fetchData.ingested} fetched. Embedding…`);

      // Record the fetch time (server-authoritative; falls back to now).
      const fetchedAt = fetchData.fetchedAt ?? new Date().toISOString();
      setLastFetchedAt(fetchedAt);
      try { localStorage.setItem("newshub-last-fetched", fetchedAt); } catch { /* ignore */ }

      let totalEmbedded = 0;
      let remaining = 999;
      while (remaining > 0) {
        const embedRes  = await fetch("/api/embed-missing", { method: "POST" });
        const embedData = await embedRes.json() as { embedded: number; remaining: number };
        totalEmbedded += embedData.embedded;
        remaining = embedData.remaining;
        if (embedData.embedded === 0) break;
      }

      // Step 3: Scrape full article content in background (non-blocking)
      setFetchResult(lang === "ja" ? "本文取得中…" : "Scraping content…");
      fetch("/api/scrape-content", { method: "POST" }).catch(() => {});
      // Fire-and-forget — don't await so UI isn't blocked

      setFetchResult(lang === "ja" ? `${fetchData.ingested}件取得, ${totalEmbedded}件処理完了` : `${fetchData.ingested} fetched, ${totalEmbedded} embedded`);
      router.refresh();
    } catch {
      setFetchResult(lang === "ja" ? "取得エラー" : "Fetch error");
    } finally {
      setFetching(false);
      setTimeout(() => setFetchResult(null), 8000);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-20 bg-[var(--bg)]/85 backdrop-blur-md border-b hairline">
        <div className="max-w-6xl mx-auto px-4 md:px-10 h-14 flex items-center gap-3">

          {/* Hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden p-1.5 rounded-md text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors flex-shrink-0"
            aria-label={t("menu")}
          >
            <Menu size={16} strokeWidth={1.5} />
          </button>

          {/* Search */}
          <form onSubmit={submit} className="flex-1 max-w-md">
            <input
              value={val}
              onChange={e => setVal(e.target.value)}
              type="search"
              placeholder={t("searchPlaceholder")}
              className="w-full bg-transparent text-sm py-2 border-b hairline focus:border-[var(--ink)] outline-none placeholder:text-[var(--ink-4)]"
            />
          </form>

          {/* Time range */}
          <div className="hidden sm:flex items-center gap-0.5">
            {TIME_RANGES.map(tr => (
              <button
                key={tr.hours}
                onClick={() => setTimeRange(tr.hours)}
                className={[
                  "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                  currentHours === tr.hours
                    ? "bg-[var(--ink)] text-ink-contrast"
                    : "text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
                ].join(" ")}
              >
                {t(tr.key)}
              </button>
            ))}
          </div>

          {/* Keyword alert bell */}
          {mounted && (
            <div className="relative" ref={alertRef}>
              <button
                onClick={() => setAlertOpen(o => !o)}
                className="p-1.5 rounded-md text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors relative"
                title={t("alertKeywords")}
              >
                <Bell size={15} strokeWidth={1.5} />
                {keywords.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 bg-[var(--ink)] text-ink-contrast text-[9px] font-bold rounded-full flex items-center justify-center">
                    {keywords.length}
                  </span>
                )}
              </button>

              {/* Animated dropdown */}
              <div
                className={[
                  "absolute right-0 top-full mt-2 w-72 bg-[var(--surface)] border hairline rounded-xl shadow-xl z-40 p-4 space-y-3",
                  "transition-all duration-200 origin-top-right",
                  alertOpen
                    ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                    : "opacity-0 scale-95 -translate-y-1 pointer-events-none",
                ].join(" ")}
              >
                <span className="text-[11px] uppercase tracking-widest text-[var(--ink-3)]">{t("alertKeywords")}</span>

                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {keywords.map(kw => (
                      <span key={kw} className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-[var(--line-soft)] rounded-full border hairline">
                        {kw}
                        <button onClick={() => removeKeyword(kw)} className="text-[var(--ink-3)] hover:text-[var(--ink)] leading-none">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={e => { e.preventDefault(); addKeyword(alertInput); setAlertInput(""); }}
                  className="flex gap-2"
                >
                  <input
                    value={alertInput}
                    onChange={e => setAlertInput(e.target.value)}
                    placeholder={t("alertPlaceholder")}
                    className="flex-1 text-sm bg-[var(--line-soft)] px-3 py-1.5 rounded-md outline-none focus:ring-1 ring-[var(--ink)]"
                  />
                  <button type="submit" disabled={!alertInput.trim()}
                    className="px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-[var(--ink)] text-ink-contrast disabled:opacity-40">
                    +
                  </button>
                </form>

                <p className="text-[10px] text-[var(--ink-4)]">
                  {lang === "ja"
                    ? "マッチした記事はニュース一覧のバナーに表示されます。"
                    : "Matched articles appear as a banner in the news feed."}
                </p>
              </div>
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={fetchNews}
            disabled={fetching}
            className={[
              "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1.5",
              fetching
                ? "bg-[var(--line-soft)] text-[var(--ink-4)]"
                : "ring-1 ring-inset ring-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
            ].join(" ")}
          >
            <RefreshCw size={12} strokeWidth={1.5} className={fetching ? "animate-spin" : ""} />
            <span className="hidden sm:inline">
              {fetching ? (lang === "ja" ? "処理中…" : "Working…") : (lang === "ja" ? "更新" : "Refresh")}
            </span>
          </button>

          {fetchResult ? (
            <span className="text-[11px] text-emerald-600 font-medium hidden md:inline truncate max-w-[160px]">
              {fetchResult}
            </span>
          ) : lastFetchedAt ? (
            <span className="text-[10px] text-[var(--ink-4)] hidden md:inline font-mono">
              {lang === "ja"
                ? `最終更新 ${new Date(lastFetchedAt).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                : `Updated ${new Date(lastFetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
            </span>
          ) : null}

          {/* Theme toggle */}
          {themeMounted && (
            <button
              onClick={toggleTheme}
              title={lang === "ja"
                ? (theme === "dark" ? "ダークモード" : theme === "light" ? "ライトモード" : "システム設定")
                : (theme === "dark" ? "Dark mode" : theme === "light" ? "Light mode" : "System")}
              className="p-1.5 rounded-md text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors"
            >
              {theme === "dark"  ? <Moon size={14} strokeWidth={1.5} /> :
               theme === "light" ? <Sun  size={14} strokeWidth={1.5} /> :
                                   <Monitor size={14} strokeWidth={1.5} />}
            </button>
          )}

          {/* Lang toggle — shows the CURRENT language with a globe icon,
             so it reads as a status + switch rather than a cryptic target
             label. Tooltip states what clicking will do. */}
          <button
            onClick={toggle}
            title={lang === "ja" ? "English に切り替え" : "Switch to Japanese"}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono font-medium rounded-md ring-1 ring-inset ring-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors"
          >
            <Globe className="w-3 h-3" />
            {lang === "ja" ? "JP" : "EN"}
          </button>

          <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] hidden lg:block flex-shrink-0">
            {new Date().toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
              weekday: "short", month: "short", day: "numeric",
            })}
          </span>
        </div>
      </header>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
