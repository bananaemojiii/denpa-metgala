// Denpa ingest worker — always-on background process.
// Consumes AP Wire + X filtered stream + RSS in parallel,
// runs LLM extraction on each item, matches to a market ticker,
// then publishes to Redis denpa:arrivals for the web SSE endpoint.
// Also polls Kalshi for market resolution events.
import { readFile } from "fs/promises";
import { pollApWire } from "./feeds/ap-wire.ts";
import { startXStream } from "./feeds/x-stream.ts";
import { pollRss } from "./feeds/rss.ts";
import { extractSignal, matchMarket } from "./extractors/signal.ts";
import { publishArrival, closePublisher } from "./publishers/redis.ts";
import { startKalshiPoller } from "./resolution/kalshi-poller.ts";
import { closeResolutionPublisher } from "./resolution/redis-resolution.ts";

export type MarketMap = Record<string, string>; // keyword → Kalshi ticker

// --- Config ---
const POLL_INTERVAL_MS = 30_000; // AP Wire + RSS polling cadence
const MARKET_MAP_PATH = process.env.MARKET_MAP_PATH ?? "./market-map.json";

async function loadMarketMap(): Promise<MarketMap> {
  try {
    const raw = await readFile(MARKET_MAP_PATH, "utf-8");
    return JSON.parse(raw) as MarketMap;
  } catch {
    console.warn("[worker] market-map.json not found — market matching disabled");
    return {};
  }
}

// --- Item processing ---

interface RawItem {
  id: string;
  text: string;
  source: "ap-wire" | "x-stream" | "rss";
}

const processedIds = new Set<string>();

async function processItem(item: RawItem, marketMap: MarketMap): Promise<void> {
  if (processedIds.has(item.id)) return;
  processedIds.add(item.id);

  const signal = await extractSignal(item.text);
  if (!signal) return;

  const ticker = matchMarket(signal, marketMap) ?? "METGALA26-BEST-DRESSED";

  await publishArrival({
    id: item.id,
    celeb: signal.celeb,
    designer: signal.designer,
    marketTicker: ticker,
    source: item.source,
    confidence: signal.confidence,
    ts: Date.now(),
  });

  console.log(
    `[worker] arrival: ${signal.celeb} / ${signal.designer} → ${ticker} (${item.source}, conf ${signal.confidence.toFixed(2)})`
  );
}

// --- Polling loop (AP Wire + RSS) ---

async function startPollingLoop(marketMap: MarketMap): Promise<void> {
  async function tick() {
    const [wireItems, rssItems] = await Promise.allSettled([
      pollApWire(),
      pollRss(),
    ]);

    const items: RawItem[] = [
      ...(wireItems.status === "fulfilled"
        ? wireItems.value.map((i) => ({ id: i.id, text: `${i.headline} ${i.body}`, source: "ap-wire" as const }))
        : []),
      ...(rssItems.status === "fulfilled"
        ? rssItems.value.map((i) => ({ id: i.id, text: `${i.title} ${i.description}`, source: "rss" as const }))
        : []),
    ];

    // Process concurrently but cap at 5 at a time to stay within rate limits
    for (let i = 0; i < items.length; i += 5) {
      await Promise.all(items.slice(i, i + 5).map((it) => processItem(it, marketMap)));
    }
  }

  // Run immediately, then on interval
  await tick().catch((e) => console.error("[worker] poll error:", e));
  setInterval(() => tick().catch((e) => console.error("[worker] poll error:", e)), POLL_INTERVAL_MS);
}

// --- Main ---

async function main() {
  console.log("[worker] starting Denpa ingest worker");
  const marketMap = await loadMarketMap();
  console.log(`[worker] loaded ${Object.keys(marketMap).length} market keyword mappings`);

  // X stream runs as a long-lived connection
  startXStream(async (item) => {
    await processItem({ id: item.id, text: item.text, source: "x-stream" }, marketMap).catch(
      (e) => console.error("[worker] x-stream process error:", e)
    );
  });

  // Kalshi resolution poller — auto-detects finalized markets
  const tickers = [...new Set(Object.values(marketMap))];
  startKalshiPoller(tickers);

  // Polling feeds run on interval
  await startPollingLoop(marketMap);
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[worker] shutting down");
  await Promise.all([closePublisher(), closeResolutionPublisher()]);
  process.exit(0);
});

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
