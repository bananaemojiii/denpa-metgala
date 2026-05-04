// X (Twitter) filtered stream — connects to v2 streaming endpoint,
// maintains rules for Met Gala carpet coverage, emits tweet text.
// Reconnects on disconnect with backoff.

const BEARER = process.env.X_BEARER_TOKEN ?? "";
const RULES_URL = "https://api.twitter.com/2/tweets/search/stream/rules";
const STREAM_URL =
  "https://api.twitter.com/2/tweets/search/stream?tweet.fields=text,created_at&expansions=author_id";

export interface XItem {
  id: string;
  text: string;
  source: "x-stream";
}

const RULE_TAG = "denpa-metgala-2026";
const RULE_VALUE =
  '("met gala" OR #MetGala2026) (arrived OR wearing OR dressed OR carpet OR designer) -is:retweet lang:en';

type XHandler = (item: XItem) => void;

async function apiFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${BEARER}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
}

async function ensureRule(): Promise<void> {
  // Delete stale rules with our tag, then create fresh one
  const existing = await apiFetch(RULES_URL);
  const data = (await existing.json()) as { data?: Array<{ id: string; tag?: string }> };
  const stale = (data.data ?? []).filter((r) => r.tag === RULE_TAG).map((r) => r.id);
  if (stale.length) {
    await apiFetch(RULES_URL, {
      method: "POST",
      body: JSON.stringify({ delete: { ids: stale } }),
    });
  }
  await apiFetch(RULES_URL, {
    method: "POST",
    body: JSON.stringify({ add: [{ value: RULE_VALUE, tag: RULE_TAG }] }),
  });
}

export async function startXStream(onItem: XHandler): Promise<void> {
  if (!BEARER) {
    console.warn("[x-stream] X_BEARER_TOKEN not set — skipping");
    return;
  }
  await ensureRule();
  connectStream(onItem, 1000);
}

function connectStream(onItem: XHandler, retryMs: number): void {
  apiFetch(STREAM_URL, { signal: AbortSignal.timeout(0) })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue; // heartbeat blank line
          try {
            const msg = JSON.parse(trimmed) as { data?: { id: string; text: string } };
            if (msg.data?.id) {
              onItem({ id: msg.data.id, text: msg.data.text, source: "x-stream" });
            }
          } catch {
            // non-JSON line
          }
        }
      }
      // Stream ended — reconnect
      scheduleReconnect(onItem, 1000);
    })
    .catch((err) => {
      console.warn("[x-stream] connection error:", (err as Error).message);
      scheduleReconnect(onItem, Math.min(retryMs * 2, 60_000));
    });
}

function scheduleReconnect(onItem: XHandler, retryMs: number) {
  console.log(`[x-stream] reconnecting in ${retryMs}ms`);
  setTimeout(() => connectStream(onItem, retryMs), retryMs);
}
