// components/layout/ScrollToTopButton.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowUp } from "@/components/ui/Icon";

const SHOW_AFTER_PX = 480; // roughly "past the fold" on most screens

/**
 * Floating "back to top" button, shown once the person has scrolled down
 * far enough that returning to the top by hand would take a while —
 * fades/slides in rather than appearing abruptly.
 */
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }
    onScroll(); // in case the page loads already scrolled (e.g. anchor link)
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className={[
        "fixed bottom-6 left-6 md:left-[calc(15rem+1.5rem)] z-40 p-3 rounded-full shadow-lg",
        "bg-[var(--ink)] text-ink-contrast hover:opacity-90",
        "transition-all duration-300 ease-out",
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-3 pointer-events-none",
      ].join(" ")}
    >
      <ArrowUp size={18} strokeWidth={2} />
    </button>
  );
}
