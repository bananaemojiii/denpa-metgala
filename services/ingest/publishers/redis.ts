import Redis from "ioredis";

const CHANNEL = "denpa:arrivals";

let pub: Redis | null = null;

function getPublisher(): Redis {
  if (!pub) {
    pub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    pub.on("error", (err) => console.error("[redis]", err.message));
  }
  return pub;
}

export interface ArrivalEvent {
  id: string;
  celeb: string;
  designer: string;
  marketTicker: string;
  source: "ap-wire" | "x-stream" | "rss" | "manual";
  confidence: number;
  ts: number;
}

export async function publishArrival(event: ArrivalEvent): Promise<void> {
  await getPublisher().publish(CHANNEL, JSON.stringify(event));
}

export async function closePublisher(): Promise<void> {
  await pub?.quit();
  pub = null;
}
