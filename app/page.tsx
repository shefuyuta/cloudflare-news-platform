import { Sidebar } from "../components/layout/Sidebar";
import { NewsGrid } from "../components/news/NewsGrid";

export default function HomePage() {
  return (
    <main className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <Sidebar />

      <section className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Global News Intelligence
          </h1>

          <p className="mt-3 text-zinc-500">
            General / Cybersecurity / AI
          </p>
        </div>

        <NewsGrid />
      </section>
    </main>
  );
}
