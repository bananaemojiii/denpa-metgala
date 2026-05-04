// Asserts a market outcome on UMA OOv3.
// Call assertMarketOutcome() after the admin resolves a market.
// The assertion enters a 2hr dispute window; if unchallenged, settle() finalizes it.
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  encodeFunctionData,
  toBytes,
  toHex,
  type Hash,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import {
  ACTIVE_CHAIN,
  CHAIN_CONFIGS,
  OOV3_ABI,
  ASSERT_TRUTH_IDENTIFIER,
} from "./uma-oov3.ts";

const CHAIN_DEFS = { base, optimism };

const config = CHAIN_CONFIGS[ACTIVE_CHAIN];

function buildClients() {
  const pk = process.env.ASSERTER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) throw new Error("ASSERTER_PRIVATE_KEY not set");

  const account = privateKeyToAccount(pk);
  const chain = CHAIN_DEFS[ACTIVE_CHAIN];
  const transport = http(config.rpcUrl);

  const wallet = createWalletClient({ account, chain, transport });
  const pub = createPublicClient({ chain, transport });
  return { wallet, pub, account };
}

// Build a human-readable claim for a denpa market outcome
function buildClaim(ticker: string, outcome: "yes" | "no", note?: string): `0x${string}` {
  const text = [
    `Denpa Met Gala 2026 market resolution.`,
    `Market ticker: ${ticker}.`,
    `Outcome: ${outcome.toUpperCase()}.`,
    note ? `Note: ${note}` : null,
    `Resolved at: ${new Date().toISOString()}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return toHex(toBytes(text));
}

export interface AssertionRecord {
  assertionId: Hash;
  ticker: string;
  outcome: "yes" | "no";
  expiresAt: number; // unix ms — when dispute window closes
  txHash: Hash;
}

const assertions = new Map<string, AssertionRecord>(); // ticker → record

export async function assertMarketOutcome(
  ticker: string,
  outcome: "yes" | "no",
  note?: string
): Promise<AssertionRecord> {
  const existing = assertions.get(ticker);
  if (existing) {
    console.log(`[asserter] already asserted ${ticker} — returning existing record`);
    return existing;
  }

  const { wallet, pub, account } = buildClients();

  // First approve OOv3 to spend bond USDC — skip if already approved
  // (in production, pre-approve a large amount to save gas)
  const approveTx = await wallet.writeContract({
    address: config.bondCurrency,
    abi: [
      {
        name: "approve",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
        outputs: [{ name: "", type: "bool" }],
      },
    ] as const,
    functionName: "approve",
    args: [config.oov3, config.bondAmount],
  });
  await pub.waitForTransactionReceipt({ hash: approveTx });

  // 7200s = 2hr liveness (dispute window) — short enough for same-night resolution
  const LIVENESS = 7200n;

  const txHash = await wallet.writeContract({
    address: config.oov3,
    abi: OOV3_ABI,
    functionName: "assertTruth",
    args: [
      buildClaim(ticker, outcome, note),
      account.address,
      "0x0000000000000000000000000000000000000000" as Address, // no callback
      "0x0000000000000000000000000000000000000000" as Address, // no escalation manager
      LIVENESS,
      config.bondCurrency,
      config.bondAmount,
      ASSERT_TRUTH_IDENTIFIER,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ],
  });

  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });

  // Parse assertionId from logs — it's the first bytes32 in AssertionMade event
  // (topic[1] after the event signature)
  const assertionId = (receipt.logs[0]?.topics?.[1] ?? "0x") as Hash;

  const record: AssertionRecord = {
    assertionId,
    ticker,
    outcome,
    expiresAt: Date.now() + Number(LIVENESS) * 1000,
    txHash,
  };

  assertions.set(ticker, record);
  console.log(`[asserter] asserted ${ticker} → ${outcome} | id=${assertionId} tx=${txHash}`);
  return record;
}

// Call after dispute window — settles the assertion on-chain
export async function settleAssertion(assertionId: Hash): Promise<Hash> {
  const { wallet, pub } = buildClients();
  const txHash = await wallet.writeContract({
    address: config.oov3,
    abi: OOV3_ABI,
    functionName: "settleAssertion",
    args: [assertionId],
  });
  await pub.waitForTransactionReceipt({ hash: txHash });
  console.log(`[asserter] settled assertion ${assertionId} | tx=${txHash}`);
  return txHash;
}

export function getAssertions(): Map<string, AssertionRecord> {
  return assertions;
}
