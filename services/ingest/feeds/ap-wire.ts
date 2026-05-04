// AP Wire feed — polls /media/v/content/feed for Met Gala items.
// Dedupes by item ID. Returns new items since last poll.

const AP_BASE = "https://api.ap.org/media/v/content";
const API_KEY = process.env.AP_WIRE_API_KEY ?? "";

export interface WireItem {
  id: string;
  headline: string;
  body: string;
  pubDate: string;
  source: "ap-wire";
}

const seen = new Set<string>();

export async function pollApWire(): Promise<WireItem[]> {
  if (!API_KEY) return [];

  const url = new URL(`${AP_BASE}/feed`);
  url.searchParams.set("apikey", API_KEY);
  url.searchParams.set("q", "met gala");
  url.searchParams.set("daterange", "last1h");
  url.searchParams.set("pagesize", "20");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    console.warn(`[ap-wire] HTTP ${res.status}`);
    return [];
  }

  const data = (await res.json()) as {
    data?: {
      items?: Array<{
        item: {
          altids: { itemid: string };
          headline?: string;
          body_html?: string;
          firstcreated?: string;
        };
      }>;
    };
  };

  const items: WireItem[] = [];
  for (const entry of data.data?.items ?? []) {
    const { altids, headline, body_html, firstcreated } = entry.item;
    const id = altids?.itemid;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      headline: headline ?? "",
      body: body_html?.replace(/<[^>]+>/g, " ").trim() ?? "",
      pubDate: firstcreated ?? new Date().toISOString(),
      source: "ap-wire",
    });
  }
  return items;
}
