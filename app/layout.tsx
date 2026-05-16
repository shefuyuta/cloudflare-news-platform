// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { AIChatDock } from "@/components/chat/AIChatDock";
import { Suspense } from "react"; 

export const metadata: Metadata = {
  title: "NewsHub",
  description: "A curated, AI-augmented news desk.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <div className="flex">
          <Sidebar />
          <div className="flex-1 min-w-0 ml-0 md:ml-60">
            <Suspense>
            <Header />
            </Suspense>
            <main className="px-6 md:px-10 py-8 max-w-6xl mx-auto">{children}</main>
          </div>
        </div>
        {/* AI bot lives at the page edge; current view is passed via URL,
            so it picks up category/region/subcategory automatically. */}
        <Suspense>
        <AIChatDock />
        </Suspense>
      </body>
    </html>
  );
}
