// Publishes resolution events to the denpa:resolution Redis channel.
// Shared by kalshi-poller and any other ingest-side resolution triggers.
import Redis from "ioredis";

const CHANNEL = "denpa:resolution";
let pub: Redis | null = null;

function getPublisher(): Redis {
  if (!pub) {
    pub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    pub.on("error", (err) => console.error("[redis-resolution]", err.message));
  }
  return pub;
}

export interface ResolutionEvent {
  ticker: string;
  resolution: "resolving" | "provisional" | "settled";
  outcome: "yes" | "no";
  source: "admin" | "kalshi" | "uma";
  note?: string;
  ts: number;
}

export async function publishResolution(event: ResolutionEvent): Promise<void> {
  await getPublisher().publish(CHANNEL, JSON.stringify(event));
}

export async function closeResolutionPublisher(): Promise<void> {
  await pub?.quit();
  pub = null;
}
