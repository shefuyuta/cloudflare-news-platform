// components/LangProvider.tsx
"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
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

  const toggle = useCallback(() => {
    const next: Lang = lang === "ja" ? "en" : "ja";
    setLang(next);
    // Set cookie (expires in 1 year)
    document.cookie = `${LANG_COOKIE}=${next};path=/;max-age=31536000;SameSite=Lax`;
    // Update html lang attribute for browser translation
    document.documentElement.lang = next;
  }, [lang]);

  const t = useCallback((key: TKey) => translate(key, lang), [lang]);

  return <Ctx.Provider value={{ lang, toggle, t }}>{children}</Ctx.Provider>;
}
