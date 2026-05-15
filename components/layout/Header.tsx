// components/Header.tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

export function Header() {
  const router  = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const [val, setVal] = useState(params.get("q") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams(params);
    if (val.trim()) sp.set("q", val.trim()); else sp.delete("q");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <header className="sticky top-0 z-20 bg-[var(--bg)]/85 backdrop-blur-md border-b hairline">
      <div className="max-w-6xl mx-auto px-6 md:px-10 h-14 flex items-center gap-6">
        <form onSubmit={submit} className="flex-1 max-w-xl">
          <input
            value={val}
            onChange={e => setVal(e.target.value)}
            type="search"
            placeholder="Search headlines, tags, sources…"
            className="w-full bg-transparent text-sm py-2 border-b hairline focus:border-[var(--ink)] outline-none placeholder:text-[var(--ink-4)]"
          />
        </form>
        <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] hidden sm:block">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        </span>
      </div>
    </header>
  );
}
