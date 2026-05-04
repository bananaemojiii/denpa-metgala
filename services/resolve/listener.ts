// Watches UMA OOv3 for AssertionSettled events and publishes final resolution.
// When an assertion we made settles, we transition the market: resolving → settled.
import { createPublicClient, http } from "viem";
import { base, optimism } from "viem/chains";
import Redis from "ioredis";
import {
  ACTIVE_CHAIN,
  CHAIN_CONFIGS,
  ASSERTION_SETTLED_ABI,
} from "./uma-oov3.ts";
import { getAssertions, settleAssertion } from "./asserter.ts";
import type { AssertionRecord } from "./asserter.ts";

const config = CHAIN_CONFIGS[ACTIVE_CHAIN];
const CHAIN_DEFS = { base, optimism };

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const RESOLUTION_CHANNEL = "denpa:resolution";

let pub: Redis | null = null;
function getPublisher() {
  if (!pub) {
    pub = new Redis(REDIS_URL);
    pub.on("error", (e) => console.error("[listener] redis:", e.message));
  }
  return pub;
}

async function publishSettled(record: AssertionRecord) {
  const event = {
    ticker: record.ticker,
    resolution: "settled",
    outcome: record.outcome,
    source: "uma",
    ts: Date.now(),
  };
  await getPublisher().publish(RESOLUTION_CHANNEL, JSON.stringify(event));
  console.log(`[listener] published settled: ${record.ticker} → ${record.outcome}`);
}

// Schedules settlement of an assertion after its dispute window closes.
// Also tries to auto-settle once the window has elapsed.
function scheduleSettle(record: AssertionRecord) {
  const msUntilExpiry = record.expiresAt - Date.now();
  const delay = Math.max(msUntilExpiry + 30_000, 0); // +30s buffer

  console.log(
    `[listener] scheduling settle for ${record.ticker} in ${Math.round(delay / 60_000)}min`
  );

  setTimeout(async () => {
    try {
      await settleAssertion(record.assertionId);
      await publishSettled(record);
    } catch (e) {
      console.error(`[listener] settle failed for ${record.ticker}:`, (e as Error).message);
    }
  }, delay);
}

// Watch AssertionSettled events on-chain — catch any external settlements too
export function startSettlementListener() {
  const client = createPublicClient({
    chain: CHAIN_DEFS[ACTIVE_CHAIN],
    transport: http(config.rpcUrl),
  });

  const assertions = getAssertions();

  // Watch for on-chain settlements of our assertion IDs
  client.watchContractEvent({
    address: config.oov3,
    abi: ASSERTION_SETTLED_ABI,
    eventName: "AssertionSettled",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { assertionId, settlementResolution } = log.args;
        if (!assertionId) continue;

        // Find which ticker this assertionId belongs to
        const record = [...assertions.values()].find(
          (r) => r.assertionId.toLowerCase() === assertionId.toLowerCase()
        );
        if (!record) continue;

        // settlementResolution: true = asserted claim was TRUE = outcome unchanged
        // If it's false, claim was disputed and overturned
        const finalOutcome = settlementResolution ? record.outcome : record.outcome === "yes" ? "no" : "yes";

        const event = {
          ticker: record.ticker,
          resolution: "settled",
          outcome: finalOutcome,
          source: "uma",
          ts: Date.now(),
        };
        await getPublisher().publish(RESOLUTION_CHANNEL, JSON.stringify(event));
        console.log(
          `[listener] on-chain settle: ${record.ticker} → ${finalOutcome} (disputed=${!settlementResolution})`
        );
      }
    },
    onError: (e) => console.error("[listener] watch error:", e.message),
  });

  console.log("[listener] watching AssertionSettled on", ACTIVE_CHAIN);
}

// Called by worker.ts after each assertMarketOutcome() call
export function trackAssertion(record: AssertionRecord) {
  scheduleSettle(record);
}
