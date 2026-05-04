// Polls Kalshi REST API every 30s for each tracked market.
// When a market finalizes, publishes a resolution event to denpa:resolution.
// This is the automatic path — admin/UMA flow handles manual overrides.
import { publishResolution } from "./redis-resolution.ts";

const KALSHI_HOST = process.env.KALSHI_API_HOST ?? "https://trading-api.kalshi.com";
const KALSHI_KEY = process.env.KALSHI_API_KEY ?? "";
const POLL_MS = 30_000;

interface KalshiMarket {
  ticker: string;
  status: string; // "active" | "closed" | "settled" | "finalized"
  result?: string; // "yes" | "no" | "" for unresolved
}

const resolved = new Set<string>();

async function fetchMarket(ticker: string): Promise<KalshiMarket | null> {
  if (!KALSHI_KEY) return null;
  try {
    const res = await fetch(`${KALSHI_HOST}/trade-api/rest/v2/markets/${ticker}`, {
      headers: { Authorization: `Bearer ${KALSHI_KEY}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { market?: KalshiMarket };
    return data.market ?? null;
  } catch {
    return null;
  }
}

async function pollTickers(tickers: string[]): Promise<void> {
  await Promise.all(
    tickers
      .filter((t) => !resolved.has(t))
      .map(async (ticker) => {
        const market = await fetchMarket(ticker);
        if (!market) return;

        if (market.status === "finalized" && (market.result === "yes" || market.result === "no")) {
          resolved.add(ticker);
          await publishResolution({
            ticker,
            resolution: "settled",
            outcome: market.result,
            source: "kalshi",
            ts: Date.now(),
          });
          console.log(`[kalshi-poller] settled: ${ticker} → ${market.result}`);
        }
      })
  );
}

export function startKalshiPoller(tickers: string[]): void {
  if (!KALSHI_KEY) {
    console.warn("[kalshi-poller] KALSHI_API_KEY not set — resolution polling disabled");
    return;
  }

  // Initial poll immediately
  pollTickers(tickers).catch((e) => console.error("[kalshi-poller] poll error:", e));

  setInterval(() => {
    pollTickers(tickers).catch((e) => console.error("[kalshi-poller] poll error:", e));
  }, POLL_MS);

  console.log(`[kalshi-poller] watching ${tickers.length} markets every ${POLL_MS / 1000}s`);
}
