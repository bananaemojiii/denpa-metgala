// Paper trade orders — simulates a fill at the current market price.
// No real money moves. Positions are tracked client-side and on the leaderboard.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

interface OrderBody {
  ticker: string;
  side: "yes" | "no";
  contracts: number;
  price: number; // current market price in cents, supplied by client
}

export async function POST(req: NextRequest) {
  let body: OrderBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ticker, side, contracts, price } = body;
  if (!ticker || !side || !contracts || contracts < 1 || !price) {
    return NextResponse.json({ error: "Invalid order params" }, { status: 400 });
  }

  // Simulate a tiny 1-cent slippage on paper fills
  const fillPrice = Math.min(99, Math.max(1, price + (Math.random() > 0.5 ? 1 : 0)));

  return NextResponse.json({
    orderId: `paper-${randomUUID()}`,
    fillPrice,
    paper: true,
  });
}
