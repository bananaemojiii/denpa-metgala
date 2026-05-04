"use client";

import { useRef, useEffect, useState } from "react";
import type { Market } from "@/stores/markets";

interface Props {
  market: Market;
  onBet: (ticker: string, side: "yes" | "no") => void;
}

const RESOLUTION_BADGE: Record<string, string> = {
  open: "",
  resolving: "text-amber-400 border-amber-400",
  provisional: "text-amber-400 border-amber-400",
  settled: "text-green-400 border-green-400",
};

const RESOLUTION_LABEL: Record<string, string> = {
  resolving: "RESOLVING",
  provisional: "PROVISIONAL",
  settled: "SETTLED",
};

export function MarketCard({ market, onBet }: Props) {
  const prevYes = useRef(market.yesPrice);
  const [flashClass, setFlashClass] = useState("");

  useEffect(() => {
    if (market.flashDir === null) return;
    setFlashClass(market.flashDir === "up" ? "flash-up" : "flash-down");
    const t = setTimeout(() => setFlashClass(""), 650);
    prevYes.current = market.yesPrice;
    return () => clearTimeout(t);
  }, [market.flashKey, market.flashDir]);

  const settled = market.resolution === "settled";
  const badge = RESOLUTION_LABEL[market.resolution];

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 transition-all ${flashClass}`}
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug">{market.title}</span>
        {badge && (
          <span
            className={`text-xs border rounded px-1 py-0.5 shrink-0 ${RESOLUTION_BADGE[market.resolution]}`}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Probability bar */}
      <div className="flex items-center gap-2 text-xs">
        <span style={{ color: "var(--yes)" }} className="font-bold tabular-nums w-12">
          YES {market.yesPrice}¢
        </span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-zinc-800">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${market.yesPrice}%`,
              background: settled
                ? market.outcome === "yes"
                  ? "var(--yes)"
                  : "var(--no)"
                : "var(--yes)",
            }}
          />
        </div>
        <span style={{ color: "var(--no)" }} className="font-bold tabular-nums w-12 text-right">
          {market.noPrice}¢ NO
        </span>
      </div>

      {/* Volume + bet buttons */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Vol ${(market.volume / 100).toLocaleString()}
        </span>
        {!settled && (
          <div className="flex gap-1">
            <button
              onClick={() => onBet(market.ticker, "yes")}
              className="text-xs px-2 py-1 rounded font-bold transition-colors"
              style={{ background: "var(--yes)", color: "#000" }}
            >
              YES
            </button>
            <button
              onClick={() => onBet(market.ticker, "no")}
              className="text-xs px-2 py-1 rounded font-bold transition-colors"
              style={{ background: "var(--no)", color: "#fff" }}
            >
              NO
            </button>
          </div>
        )}
        {settled && market.outcome && (
          <span
            className="text-xs font-bold"
            style={{ color: market.outcome === "yes" ? "var(--yes)" : "var(--no)" }}
          >
            {market.outcome.toUpperCase()} ✓
          </span>
        )}
      </div>
    </div>
  );
}
