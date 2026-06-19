// Market chat — one capped Redis List per market, keyed by ticker.
// GET  ?ticker=&afterSeq=&beforeSeq=&limit=  → messages ascending (see params below)
// POST { ticker, username, body, clientId } → append a message
//
// Mirrors the leaderboard route's conventions: nodejs runtime, lazy ioredis
// singleton, inline validation, NextResponse.json error envelopes. No new deps.
import { NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const LIST_PREFIX = "denpa:chat:";        // list per market: denpa:chat:<ticker>
const SEQ_PREFIX = "denpa:chatseq:";      // monotonic counter per market
const RATE_PREFIX = "denpa:chatrate:";    // anti-spam counter per user

const MAX_MESSAGES = 300;                 // capped history per market
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_BODY = 1000;                    // chars
const RATE_MAX = 8;                       // messages per RATE_WINDOW
const RATE_WINDOW = 10;                   // seconds

// Lazy singleton so `next build` never dials Redis at module load.
let redis: Redis | null = null;
function getRedis() {
  if (!redis) redis = new Redis(REDIS_URL);
  return redis;
}

export interface ChatMessage {
  id: string;
  clientId: string;     // client-generated; used for optimistic dedupe
  ticker: string;
  username: string;
  body: string;
  createdAt: number;    // epoch ms
  seq: number;          // monotonic per market — stable pagination cursor
}

// Tickers are uppercase slugs like METGALA26-ZENDAYA-LOEWE.
function validTicker(t: unknown): t is string {
  return typeof t === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(t);
}

function listKey(ticker: string) {
  return `${LIST_PREFIX}${ticker}`;
}

async function readAll(ticker: string): Promise<ChatMessage[]> {
  const raw = await getRedis().lrange(listKey(ticker), 0, -1);
  const out: ChatMessage[] = [];
  for (const s of raw) {
    try {
      out.push(JSON.parse(s) as ChatMessage);
    } catch {
      /* skip malformed entry */
    }
  }
  return out; // chronological (RPUSH appends to tail)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  if (!validTicker(ticker)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT)
  );
  const afterSeq = searchParams.has("afterSeq") ? Number(searchParams.get("afterSeq")) : null;
  const beforeSeq = searchParams.has("beforeSeq") ? Number(searchParams.get("beforeSeq")) : null;

  const all = await readAll(ticker);

  // Polling: everything newer than the client's latest seq, ascending.
  if (afterSeq !== null && Number.isFinite(afterSeq)) {
    const messages = all.filter((m) => m.seq > afterSeq);
    return NextResponse.json({ messages, hasMore: false });
  }

  // Load older: the page of messages immediately before a known seq.
  if (beforeSeq !== null && Number.isFinite(beforeSeq)) {
    const older = all.filter((m) => m.seq < beforeSeq);
    const page = older.slice(-limit);
    return NextResponse.json({ messages: page, hasMore: older.length > page.length });
  }

  // Initial load: the most recent `limit` messages, ascending.
  const page = all.slice(-limit);
  return NextResponse.json({ messages: page, hasMore: all.length > page.length });
}

interface PostBody {
  ticker?: string;
  username?: string;
  body?: string;
  clientId?: string;
}

export async function POST(req: NextRequest) {
  let parsed: PostBody;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ticker } = parsed;
  const username = typeof parsed.username === "string" ? parsed.username.trim() : "";
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  const clientId =
    typeof parsed.clientId === "string" && parsed.clientId.length <= 64
      ? parsed.clientId
      : randomUUID();

  if (!validTicker(ticker)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }
  // Username store is the auth boundary (same trust model as leaderboard).
  if (!username) {
    return NextResponse.json({ error: "Handle required" }, { status: 401 });
  }
  if (!body) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }
  if (body.length > MAX_BODY) {
    return NextResponse.json({ error: `Message too long (max ${MAX_BODY})` }, { status: 400 });
  }

  const r = getRedis();

  // Lightweight anti-spam: fixed window per handle. Best-effort only.
  const rateKey = `${RATE_PREFIX}${username}`;
  const count = await r.incr(rateKey);
  if (count === 1) await r.expire(rateKey, RATE_WINDOW);
  if (count > RATE_MAX) {
    return NextResponse.json({ error: "Slow down" }, { status: 429 });
  }

  const seq = await r.incr(`${SEQ_PREFIX}${ticker}`);
  const message: ChatMessage = {
    id: randomUUID(),
    clientId,
    ticker,
    username: username.slice(0, 24),
    body,
    createdAt: Date.now(),
    seq,
  };

  const key = listKey(ticker);
  await r.rpush(key, JSON.stringify(message));
  await r.ltrim(key, -MAX_MESSAGES, -1); // keep newest MAX_MESSAGES

  return NextResponse.json({ message });
}
