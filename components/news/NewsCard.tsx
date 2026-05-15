type Props = {
  article: {
    title: string;
    source: string;
    tags: string[];
    url: string;
  };
};

export function NewsCard({ article }: Props) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:shadow-xl">
      <div className="mb-4 flex flex-wrap gap-2">
        {article.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium"
          >
            #{tag}
          </span>
        ))}
      </div>

      <h2 className="mb-5 text-xl font-semibold leading-snug">
        {article.title}
      </h2>

      <div className="text-sm text-zinc-500">
        {article.source}
      </div>

      <a
        href={article.url}
        target="_blank"
        className="mt-6 inline-flex text-sm font-medium"
      >
        Open →
      </a>
    </article>
  );
}
