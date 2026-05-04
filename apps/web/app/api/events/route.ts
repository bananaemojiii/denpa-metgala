// SSE endpoint: subscribes to Redis pub/sub channels and streams events to
// the browser. Handles arrivals (celeb spotted) and resolution (market settles).
import { NextRequest } from "next/server";
import Redis from "ioredis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const CHANNELS = ["denpa:arrivals", "denpa:resolution"];

// Channel name → SSE event name
const CHANNEL_EVENT: Record<string, string> = {
  "denpa:arrivals": "arrival",
  "denpa:resolution": "resolution",
};

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sub = new Redis(REDIS_URL);

      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 25_000);

      sub.subscribe(...CHANNELS, (err) => {
        if (err) {
          clearInterval(heartbeat);
          sub.disconnect();
          controller.close();
        }
      });

      sub.on("message", (channel, message) => {
        const eventName = CHANNEL_EVENT[channel];
        if (!eventName) return;
        try {
          send(eventName, JSON.parse(message));
        } catch {
          // malformed message — skip
        }
      });

      sub.on("error", () => {
        clearInterval(heartbeat);
        sub.disconnect();
        controller.close();
      });

      return () => {
        clearInterval(heartbeat);
        sub.disconnect();
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
