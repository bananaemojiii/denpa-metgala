// Leaderboard — Redis sorted set keyed by P&L (in cents).
// GET  → top 50 players ranked by total P&L
// POST { username, ticker, side, contracts, fillPrice, outcome } → record a settled paper trade
import { NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";

export const runtime = "nodejs";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const LB_KEY = "denpa:leaderboard";         // sorted set: score = total pnl cents
const STATS_PREFIX = "denpa:user:";         // hash per user: wins, losses, bets

let redis: Redis | null = null;
function getRedis() {
  if (!redis) redis = new Redis(REDIS_URL);
  return redis;
}

export interface LeaderboardEntry {
  username: string;
  pnl: number;      // cents
  wins: number;
  losses: number;
  bets: number;
}

export interface SettleBody {
  username: string;
  ticker: string;
  side: "yes" | "no";
  contracts: number;
  fillPrice: number;  // cents
  outcome: "yes" | "no";
}

export async function GET() {
  const r = getRedis();

  // Top 50 by P&L descending
  const rows = await r.zrevrangebyscore(LB_KEY, "+inf", "-inf", "WITHSCORES", "LIMIT", 0, 50);

  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < rows.length; i += 2) {
    const username = rows[i];
    const pnl = Math.round(Number(rows[i + 1]));
    const stats = await r.hgetall(`${STATS_PREFIX}${username}`);
    entries.push({
      username,
      pnl,
      wins: Number(stats.wins ?? 0),
      losses: Number(stats.losses ?? 0),
      bets: Number(stats.bets ?? 0),
    });
  }

  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  let body: SettleBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { username, contracts, fillPrice, outcome, side } = body;
  if (!username || !contracts || !fillPrice) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const won = side === outcome;
  // P&L per contract: win = (100 - fillPrice), loss = -fillPrice
  const pnl = won ? (100 - fillPrice) * contracts : -fillPrice * contracts;

  const r = getRedis();
  const statsKey = `${STATS_PREFIX}${username}`;

  await Promise.all([
    r.zincrby(LB_KEY, pnl, username),
    r.hincrby(statsKey, "bets", 1),
    r.hincrby(statsKey, won ? "wins" : "losses", 1),
  ]);

  return NextResponse.json({ ok: true, pnl });
}
