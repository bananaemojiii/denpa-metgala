// UMA Optimistic Oracle v3 contract interface.
// Docs: https://github.com/UMAprotocol/protocol/blob/master/packages/core/contracts/optimistic-oracle-v3
//
// Chain: Base (chainId 8453). Override via UMA_CHAIN env var.
// Contract addresses — verify against https://docs.uma.xyz/resources/network-addresses
import { type Address } from "viem";

export const CHAIN_CONFIGS = {
  // Base mainnet
  base: {
    chainId: 8453,
    rpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
    oov3: "0xfb55F43fB9F48F63f9269DB7Dde3BbBe1ebDC0dE" as Address,
    // Default bond currency (USDC on Base)
    bondCurrency: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    bondAmount: 500_000_000n, // 500 USDC (6 decimals)
  },
  // Optimism mainnet
  optimism: {
    chainId: 10,
    rpcUrl: process.env.OPTIMISM_RPC_URL ?? "https://mainnet.optimism.io",
    oov3: "0x072819Bb43B50E7A251c64411e7aA362ce82803B" as Address,
    bondCurrency: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" as Address,
    bondAmount: 500_000_000n,
  },
} as const;

export type ChainName = keyof typeof CHAIN_CONFIGS;

export const ACTIVE_CHAIN: ChainName =
  (process.env.UMA_CHAIN as ChainName | undefined) ?? "base";

// assertTruth ABI (minimal — only what we call)
export const OOV3_ABI = [
  {
    name: "assertTruth",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claim", type: "bytes" },
      { name: "asserter", type: "address" },
      { name: "callbackRecipient", type: "address" },
      { name: "escalationManager", type: "address" },
      // liveness in seconds — 7200 = 2hr dispute window
      { name: "liveness", type: "uint64" },
      { name: "currency", type: "address" },
      { name: "bond", type: "uint256" },
      // "ASSERT_TRUTH" identifier as bytes32
      { name: "identifier", type: "bytes32" },
      { name: "domainId", type: "bytes32" },
    ],
    outputs: [{ name: "assertionId", type: "bytes32" }],
  },
  {
    name: "settleAssertion",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "assertionId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "getAssertion",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "assertionId", type: "bytes32" }],
    outputs: [
      {
        name: "assertion",
        type: "tuple",
        components: [
          { name: "escalationManagerSettings", type: "tuple", components: [
            { name: "arbitrateViaEscalationManager", type: "bool" },
            { name: "discardOracle", type: "bool" },
            { name: "validateDisputers", type: "bool" },
            { name: "assertingCaller", type: "address" },
            { name: "escalationManager", type: "address" },
          ]},
          { name: "asserter", type: "address" },
          { name: "assertionTime", type: "uint64" },
          { name: "settled", type: "bool" },
          { name: "currency", type: "address" },
          { name: "expirationTime", type: "uint64" },
          { name: "settlementResolution", type: "bool" },
          { name: "domainId", type: "bytes32" },
          { name: "identifier", type: "bytes32" },
          { name: "bond", type: "uint256" },
          { name: "callbackRecipient", type: "address" },
          { name: "disputer", type: "address" },
        ],
      },
    ],
  },
] as const;

// Event emitted when an assertion is settled
export const ASSERTION_SETTLED_ABI = [
  {
    name: "AssertionSettled",
    type: "event",
    inputs: [
      { name: "assertionId", type: "bytes32", indexed: true },
      { name: "bondRecipient", type: "address", indexed: true },
      { name: "disputed", type: "bool", indexed: false },
      { name: "settlementResolution", type: "bool", indexed: false },
      { name: "caller", type: "address", indexed: false },
    ],
  },
] as const;

// "ASSERT_TRUTH" padded to bytes32
export const ASSERT_TRUTH_IDENTIFIER =
  "0x4153534552545f54525554480000000000000000000000000000000000000000" as `0x${string}`;
