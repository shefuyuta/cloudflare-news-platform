// components/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/components/LangProvider";
import type { TKey } from "@/lib/i18n";

interface NavEntry {
  href: string;
  label: string;
  sub: string;
}

function useNavItems() {
  const { t } = useLang();
  const NAV: NavEntry[] = [
    { href: "/",              label: t("navLatest"),    sub: t("navLatestSub") },
    { href: "/dashboard",     label: t("navDashboard"), sub: t("navDashboardSub") },
    { href: "/search",        label: t("navSearch"),    sub: t("navSearchSub") },
    { href: "/general",       label: t("navGeneral"),   sub: t("navGeneralSub") },
    { href: "/cybersecurity", label: t("navCyber"),     sub: t("navCyberSub") },
    { href: "/ai",            label: t("navAI"),        sub: t("navAISub") },
  ];
  const CROSSCUT: NavEntry[] = [
    { href: "/ransomware",  label: t("navRansomware"),  sub: t("navRansomwareSub") },
  ];
  return { NAV, CROSSCUT, t };
}

export function Sidebar() {
  const pathname = usePathname();
  const { NAV, CROSSCUT, t } = useNavItems();

  return (
    <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-60 border-r hairline bg-[var(--surface)] z-20">
      <SidebarContent pathname={pathname} NAV={NAV} CROSSCUT={CROSSCUT} t={t} />
    </aside>
  );
}

/** Extracted so both desktop sidebar and mobile drawer can share the same nav content. */
export function SidebarContent({
  pathname,
  NAV,
  CROSSCUT,
  t,
  onNavClick,
}: {
  pathname: string;
  NAV: NavEntry[];
  CROSSCUT: NavEntry[];
  t: (k: TKey) => string;
  onNavClick?: () => void;
}) {
  return (
    <>
      {/* Brand */}
      <div className="px-6 pt-8 pb-10">
        <Link href="/" onClick={onNavClick} className="block">
          <h1 className="font-display text-xl font-semibold tracking-tight leading-tight">
            <span className="text-[var(--ink-3)]">shefutech</span>
            <br />
            News<span className="text-[var(--ink-3)]">Hub</span>
          </h1>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] mt-1.5">
            {t("editionDate")} · {new Date().toLocaleDateString("en-CA")}
          </p>
        </Link>
      </div>

      {/* Nav */}
      <nav className="px-3 flex-1 overflow-y-auto min-h-0 pb-6">
        <ul className="space-y-0.5">
          {NAV.map((item) => (
            <NavItem key={item.href} item={item} pathname={pathname} onClick={onNavClick} />
          ))}
        </ul>

        <ul className="space-y-0.5 mt-2">
          {CROSSCUT.map((item) => (
            <NavItem key={item.href} item={item} pathname={pathname} onClick={onNavClick} />
          ))}
        </ul>
      </nav>

    </>
  );
}

function NavItem({
  item,
  pathname,
  onClick,
}: {
  item: NavEntry;
  pathname: string;
  onClick?: () => void;
}) {
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  return (
    <li>
      <Link
        href={item.href}
        onClick={onClick}
        className={[
          "block px-3 py-2.5 rounded-md transition-colors",
          active
            ? "bg-[var(--ink)] text-ink-contrast"
            : "text-[var(--ink-2)] hover:bg-[var(--line-soft)]",
        ].join(" ")}
      >
        <div className="text-sm font-medium leading-tight">{item.label}</div>
        <div
          className={[
            "text-[11px] mt-0.5",
            active ? "text-ink-contrast opacity-60" : "text-[var(--ink-3)]",
          ].join(" ")}
        >
          {item.sub}
        </div>
      </Link>
    </li>
  );
}
