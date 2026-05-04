// Uses Claude to extract structured signal from a raw feed item.
// Returns null if the item isn't relevant to Met Gala.
import Anthropic from "@anthropic-ai/sdk";
import type { MarketMap } from "../worker.ts";

const client = new Anthropic();

export interface Signal {
  celeb: string;
  designer: string;
  keywords: string[];
  confidence: number; // 0–1
}

const SYSTEM = `You are a fashion event signal extractor for the Met Gala 2026.
Given a news headline or social post, extract:
- celeb: full celebrity name (empty string if none)
- designer: fashion house/designer name (empty string if unknown)
- keywords: lowercase keywords useful for matching prediction markets (celeb name parts, designer name)
- confidence: float 0.0–1.0 reflecting how certain you are this is a real carpet arrival/outfit reveal

Return ONLY valid JSON matching that shape. No markdown, no explanation.
If the item is unrelated to Met Gala arrivals or outfits, return {"celeb":"","designer":"","keywords":[],"confidence":0}.`;

export async function extractSignal(text: string): Promise<Signal | null> {
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const parsed = JSON.parse(raw) as Signal;

    if (parsed.confidence < 0.5 || !parsed.celeb) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Match extracted keywords to a market ticker from market-map.json
export function matchMarket(signal: Signal, marketMap: MarketMap): string | null {
  const keys = signal.keywords.map((k) => k.toLowerCase());
  for (const [keyword, ticker] of Object.entries(marketMap)) {
    if (keys.some((k) => k.includes(keyword.toLowerCase()))) {
      return ticker;
    }
  }
  return null;
}
