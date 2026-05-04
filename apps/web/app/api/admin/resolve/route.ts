// Admin endpoint — manually triggers market resolution during the live event.
// POST { ticker, outcome: "yes"|"no", note?: string }
// Auth: Authorization: Bearer <ADMIN_SECRET>
//
// Flow:
//   1. Publishes { ticker, resolution: "resolving", outcome } → denpa:resolution
//      → browser immediately shows RESOLVING badge
//   2. Optionally forwards to the UMA resolve service to assert on-chain
//      → dispute window elapses → UMA service publishes "settled"
import { NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";

export const runtime = "nodejs";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const UMA_SERVICE_URL = process.env.UMA_RESOLVE_SERVICE_URL ?? "";

export interface ResolutionEvent {
  ticker: string;
  resolution: "resolving" | "provisional" | "settled";
  outcome: "yes" | "no";
  source: "admin" | "kalshi" | "uma";
  note?: string;
  ts: number;
}

let pub: Redis | null = null;
function getPublisher() {
  if (!pub) pub = new Redis(REDIS_URL);
  return pub;
}

function auth(req: NextRequest): boolean {
  if (!ADMIN_SECRET) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${ADMIN_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ticker: string; outcome: "yes" | "no"; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ticker, outcome, note } = body;
  if (!ticker || !outcome || !["yes", "no"].includes(outcome)) {
    return NextResponse.json({ error: "ticker and outcome required" }, { status: 400 });
  }

  const event: ResolutionEvent = {
    ticker,
    resolution: "resolving",
    outcome,
    source: "admin",
    note,
    ts: Date.now(),
  };

  await getPublisher().publish("denpa:resolution", JSON.stringify(event));

  // Forward to UMA resolve service if configured — fire-and-forget
  if (UMA_SERVICE_URL) {
    fetch(`${UMA_SERVICE_URL}/assert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_SECRET}` },
      body: JSON.stringify({ ticker, outcome, note }),
    }).catch((e) => console.error("[admin/resolve] UMA forward failed:", e));
  }

  return NextResponse.json({ ok: true, event });
}
