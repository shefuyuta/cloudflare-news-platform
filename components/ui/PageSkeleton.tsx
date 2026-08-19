// components/ui/PageSkeleton.tsx
// Shared loading skeleton, rendered automatically by Next.js while a
// server-component page (app/*/page.tsx) is fetching data — see the
// loading.tsx file in each route directory. Kept deliberately generic
// (title bar + a handful of article-card-shaped blocks) since it's a
// placeholder shown for a fraction of a second on a fast connection, not
// a pixel-perfect mirror of each page's final layout.
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-48 bg-[var(--line-soft)] rounded-md mb-2" />
      <div className="h-4 w-72 bg-[var(--line-soft)] rounded-md mb-8" />

      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-7 w-20 bg-[var(--line-soft)] rounded-full" />
        ))}
      </div>

      <div className="divide-y divide-[var(--line)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="py-4">
            <div className="h-3 w-24 bg-[var(--line-soft)] rounded-md mb-3" />
            <div className="h-5 w-full max-w-lg bg-[var(--line-soft)] rounded-md mb-2" />
            <div className="h-3 w-20 bg-[var(--line-soft)] rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
