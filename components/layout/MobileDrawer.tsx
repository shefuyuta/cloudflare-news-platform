// components/layout/MobileDrawer.tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SidebarContent } from "./Sidebar";
import { useLang } from "@/components/LangProvider";

interface NavEntry { href: string; label: string; sub: string; }

function useNavItems() {
  const { t } = useLang();
  const NAV: NavEntry[] = [
    { href: "/",              label: t("navLatest"),    sub: t("navLatestSub") },
    { href: "/dashboard",     label: t("navDashboard"), sub: t("navDashboardSub") },
    { href: "/search",        label: t("navSearch"),    sub: t("navSearchSub") },
    { href: "/general",       label: t("navGeneral"),   sub: t("navGeneralSub") },
    { href: "/cybersecurity", label: t("navCyber"),     sub: t("navCyberSub") },
    { href: "/ai",            label: t("navAI"),        sub: t("navAISub") },
    { href: "/ai-security",   label: t("navAISecurity"), sub: t("navAISecuritySub") },
  ];
  const CROSSCUT: NavEntry[] = [
    { href: "/ransomware",  label: t("navRansomware"),  sub: t("navRansomwareSub") },
    { href: "/digest",      label: t("navDigest"),      sub: t("navDigestSub") },
  ];
  return { NAV, CROSSCUT, t };
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { NAV, CROSSCUT, t } = useNavItems();

  // Close on route change
  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Drawer panel */}
      <aside className="absolute left-0 top-0 bottom-0 w-72 bg-[var(--surface)] border-r hairline flex flex-col overflow-y-auto shadow-xl animate-slideIn">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--ink-3)] hover:text-[var(--ink)] text-2xl leading-none p-1"
          aria-label={t("close")}
        >
          ×
        </button>
        <SidebarContent
          pathname={pathname}
          NAV={NAV}
          CROSSCUT={CROSSCUT}
          t={t}
          onNavClick={onClose}
        />
      </aside>
    </div>
  );
}
