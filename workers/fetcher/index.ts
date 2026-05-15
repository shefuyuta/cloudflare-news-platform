export interface Env {
  DB: D1Database;
}

const feeds = [
  "https://thehackernews.com/rss.xml",
  "https://feeds.bbci.co.uk/news/rss.xml",
  "https://openai.com/news/rss.xml"
];

async function fetchFeed(url: string) {
  const response = await fetch(url);
  return await response.text();
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ) {
    for (const feed of feeds) {
      const xml = await fetchFeed(feed);

      await env.DB.prepare(
        `
        INSERT INTO raw_feeds (source, content)
        VALUES (?, ?)
        `
      )
        .bind(feed, xml)
        .run();
    }
  }
};
