// Kalshi fills proxy — server-side only, keeps API key off the client.
// GET /api/fills?since=<unix_ms>
// Returns fills from Kalshi for all denpa-metgala tickers since the timestamp.
import { NextRequest, NextResponse } from "next/server";
import { METGALA_MARKETS } from "@/stores/markets";

export const runtime = "nodejs";

const KALSHI_HOST = process.env.KALSHI_API_HOST ?? "https://trading-api.kalshi.com";
const KALSHI_KEY = process.env.KALSHI_API_KEY ?? "";

export interface KalshiFill {
  trade_id: string;
  order_id: string;
  ticker: string;
  side: "yes" | "no";
  count: number;
  yes_price: number;
  no_price: number;
  created_time: string; // ISO8601
}

export async function GET(req: NextRequest) {
  if (!KALSHI_KEY) {
    return NextResponse.json({ fills: [] });
  }

  const sinceMs = Number(req.nextUrl.searchParams.get("since") ?? "0");
  // Kalshi uses ISO timestamp for min_ts — convert ms to seconds epoch
  const minTs = sinceMs > 0 ? Math.floor(sinceMs / 1000) : undefined;

  // Fetch fills for all tracked tickers in parallel
  const tickers = METGALA_MARKETS.map((m) => m.ticker);

  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const url = new URL(`${KALSHI_HOST}/trade-api/rest/v2/portfolio/fills`);
      url.searchParams.set("ticker", ticker);
      url.searchParams.set("limit", "100");
      if (minTs) url.searchParams.set("min_ts", String(minTs));

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${KALSHI_KEY}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return [] as KalshiFill[];
      const data = await res.json() as { fills?: KalshiFill[] };
      return data.fills ?? [];
    })
  );

  const fills: KalshiFill[] = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );

  // Sort ascending by created_time so client can replay in order
  fills.sort((a, b) => a.created_time.localeCompare(b.created_time));

  return NextResponse.json({ fills });
}
