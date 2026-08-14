// app/digest/page.tsx
import { cookies } from "next/headers";
import { type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
import { DigestClient } from "@/components/digest/DigestClient";
export const dynamic = "force-dynamic";

export default async function DigestPage() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;

  return (
    <>
      <header className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
          {lang === "ja" ? "ダイジェスト" : "Digest"}
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">
          {lang === "ja"
            ? "AIが生成する定期サマリー。毎日9時、金曜18時（週次）、月末18時（月次）に自動更新されます。"
            : "AI-generated periodic summaries. Auto-updated daily at 9am, Fridays at 6pm (weekly), and month-end at 6pm (monthly) — all JST."}
        </p>
      </header>
      <DigestClient lang={lang} />
    </>
  );
}
