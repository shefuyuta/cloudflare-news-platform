// components/news/ExportButton.tsx
"use client";

import { useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { useLang } from "@/components/LangProvider";

export function ExportButton() {
  const { lang, t } = useLang();
  const params   = useSearchParams();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  function buildExportUrl() {
    const sp = new URLSearchParams();
    const category =
      pathname.startsWith("/general") ? "general" :
      pathname.startsWith("/cybersecurity") ? "cybersecurity" :
      pathname.startsWith("/ai") ? "ai" : undefined;

    if (category)                sp.set("category", category);
    if (params.get("q"))         sp.set("q", params.get("q")!);
    if (params.get("hours"))     sp.set("hours", params.get("hours")!);
    if (params.get("important")) sp.set("important", "1");
    for (const tag of params.getAll("tag")) sp.append("tag", tag);
    return `/api/export?${sp.toString()}`;
  }

  async function exportCSV() {
    setExporting(true);
    setOpen(false);
    try {
      const res  = await fetch(buildExportUrl());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `newshub-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function exportPDF() {
    setExporting(true);
    setOpen(false);
    try {
      // Fetch CSV data and render as printable HTML
      const res  = await fetch(buildExportUrl());
      const text = await res.text();
      const rows = text.split("\n").map(r => r.split(","));
      const [header, ...data] = rows;

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>NewsHub Export</title>
<style>
  body { font-family: -apple-system, sans-serif; font-size: 11px; color: #0a0a0a; padding: 24px; }
  h1 { font-size: 18px; border-bottom: 1px solid #e4e4e7; padding-bottom: 8px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #f4f4f5; text-align: left; padding: 6px 8px; border: 1px solid #e4e4e7; font-weight: 600; }
  td { padding: 5px 8px; border: 1px solid #e4e4e7; vertical-align: top; max-width: 200px; overflow: hidden; }
  tr:nth-child(even) { background: #fafaf9; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>shefutech NewsHub — Export ${new Date().toLocaleDateString()}</h1>
<p style="color:#71717a;margin-bottom:12px;">${data.length} articles</p>
<table>
<thead><tr>${(header ?? []).map(h => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>
${data.slice(0, 200).map(row =>
  `<tr>${row.map(cell => `<td>${cell?.replace(/""/g, '"').replace(/^"|"$/g, '') ?? ''}</td>`).join("")}</tr>`
).join("\n")}
</tbody>
</table>
</body>
</html>`;

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(htmlContent);
        win.document.close();
        win.print();
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={exporting}
        className="px-3 py-1.5 text-[11px] font-medium rounded-md ring-1 ring-inset ring-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors flex items-center gap-1.5 disabled:opacity-40"
      >
        ↓ {exporting ? (lang === "ja" ? "処理中…" : "Exporting…") : (lang === "ja" ? "エクスポート" : "Export")}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-[var(--surface)] border hairline rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
          <button
            onClick={exportCSV}
            className="w-full text-left px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors"
          >
            📊 {t("exportCSV")}
          </button>
          <button
            onClick={exportPDF}
            className="w-full text-left px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--line-soft)] transition-colors"
          >
            📄 {lang === "ja" ? "PDF出力" : "Export PDF"}
          </button>
        </div>
      )}
    </div>
  );
}
