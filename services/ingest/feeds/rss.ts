// RSS fallback — polls fashion/news RSS feeds for Met Gala items.
// Uses fast-xml-parser to parse feeds without a DOM.
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false });

export interface RssItem {
  id: string;
  title: string;
  description: string;
  pubDate: string;
  source: "rss";
}

// Add or swap feeds as needed — these are publicly available fashion/celeb feeds
const FEEDS = [
  "https://www.vogue.com/feed/rss",
  "https://wwd.com/feed/",
  "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
];

const MET_GALA_RE = /met\s*gala/i;
const seen = new Set<string>();

async function fetchFeed(url: string): Promise<RssItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Denpa/1.0 (+https://denpa.tv)" },
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);

  if (!res?.ok) return [];

  const xml = await res.text();
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: unknown[] | unknown } };
  };

  const rawItems = parsed.rss?.channel?.item;
  const items: Array<{ title?: string; description?: string; link?: string; pubDate?: string }> =
    Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const results: RssItem[] = [];
  for (const item of items) {
    const title = item.title ?? "";
    const desc = item.description ?? "";
    if (!MET_GALA_RE.test(title) && !MET_GALA_RE.test(desc)) continue;

    const id = item.link ?? `${url}-${item.pubDate}`;
    if (seen.has(id)) continue;
    seen.add(id);

    results.push({
      id,
      title,
      description: desc.replace(/<[^>]+>/g, " ").trim(),
      pubDate: item.pubDate ?? new Date().toISOString(),
      source: "rss",
    });
  }
  return results;
}

export async function pollRss(): Promise<RssItem[]> {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
