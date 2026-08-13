// components/LangProvider.tsx
"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { type Lang, type TKey, t as translate, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";

interface LangCtx {
  lang: Lang;
  toggle: () => void;
  t: (key: TKey) => string;
}

const Ctx = createContext<LangCtx>({
  lang: DEFAULT_LANG,
  toggle: () => {},
  t: (key) => key,
});

export function useLang() {
  return useContext(Ctx);
}

export function LangProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const router = useRouter();

  const toggle = useCallback(() => {
    const next: Lang = lang === "ja" ? "en" : "ja";
    setLang(next);
    // Set cookie (expires in 1 year)
    document.cookie = `${LANG_COOKIE}=${next};path=/;max-age=31536000;SameSite=Lax`;
    // Update html lang attribute for browser translation
    document.documentElement.lang = next;
    // Re-run Server Components (e.g. app/ransomware/page.tsx) so text they
    // render from the lang cookie updates immediately instead of staying in
    // the old language until the next full navigation/reload.
    router.refresh();
  }, [lang, router]);

  const t = useCallback((key: TKey) => translate(key, lang), [lang]);

  return <Ctx.Provider value={{ lang, toggle, t }}>{children}</Ctx.Provider>;
}
