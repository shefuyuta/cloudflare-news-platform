// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { AIChatDock } from "@/components/chat/AIChatDock";
import { LangProvider } from "@/components/LangProvider";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { type Lang, DEFAULT_LANG, LANG_COOKIE } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "shefutech News Hub",
  description: "AI-augmented news desk powered by Cloudflare.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const lang = (cookieStore.get(LANG_COOKIE)?.value as Lang) ?? DEFAULT_LANG;

  return (
    <html lang={lang}>
      <body className="min-h-screen">
        <LangProvider initialLang={lang}>
          <div className="flex">
            <Sidebar />
            <div className="flex-1 min-w-0 ml-0 md:ml-60">
              <Suspense>
                <Header />
              </Suspense>
              <main className="px-6 md:px-10 py-8 max-w-6xl mx-auto">{children}</main>
            </div>
          </div>
          <Suspense>
            <AIChatDock />
          </Suspense>
        </LangProvider>
      </body>
    </html>
  );
}
