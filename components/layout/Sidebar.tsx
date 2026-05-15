export function Sidebar() {
  return (
    <aside className="w-72 border-r border-zinc-200 bg-white p-6">
      <div className="mb-10">
        <h2 className="text-2xl font-bold">NewsHub</h2>
      </div>

      <nav className="space-y-2">
        {[
          "General",
          "Cybersecurity",
          "AI",
          "Important",
          "Trending"
        ].map((item) => (
          <button
            key={item}
            className="w-full rounded-xl px-4 py-3 text-left hover:bg-zinc-100"
          >
            {item}
          </button>
        ))}
      </nav>
    </aside>
  );
}
