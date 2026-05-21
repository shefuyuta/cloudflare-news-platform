// app/dashboard/page.tsx
import { cookies } from "next/headers";
import { t, type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;

  return (
    <>
      <header className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
          {t("dashboardTitle", lang)}
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-2">{t("dashboardSub", lang)}</p>
      </header>
      <DashboardClient />
    </>
  );
}
