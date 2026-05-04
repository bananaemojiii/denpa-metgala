"use client";

import { useState } from "react";
import { useMarketsStore } from "@/stores/markets";
import { usePositionsStore } from "@/stores/positions";

interface Props {
  ticker: string;
  side: "yes" | "no";
  onClose: () => void;
}

const PRESETS = [5, 25, 100];

export function BetSheet({ ticker, side, onClose }: Props) {
  const market = useMarketsStore((s) => s.markets.find((m) => m.ticker === ticker));
  const addPosition = usePositionsStore((s) => s.addPosition);
  const [amount, setAmount] = useState(25);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  if (!market) return null;

  const price = side === "yes" ? market.yesPrice : market.noPrice;
  const contracts = Math.floor((amount * 100) / price); // 1 contract = $1 payout
  const maxPayout = contracts; // in dollars

  async function place() {
    if (!market) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, side, contracts, price }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { orderId: string; fillPrice: number };
      addPosition({
        id: data.orderId,
        ticker,
        marketTitle: market.title,
        side,
        contracts,
        avgPrice: data.fillPrice ?? price,
        placedAt: Date.now(),
        status: "open",
      });
      setStatus("success");
      setTimeout(onClose, 1200);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl md:rounded-2xl p-5 space-y-4 slide-in"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm">{market.title}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs px-1.5 py-0.5 rounded font-bold uppercase"
              style={{ background: "rgba(245,158,11,0.15)", color: "var(--amber)", border: "1px solid var(--amber)" }}>
              paper
            </span>
            <button onClick={onClose} className="text-lg leading-none" style={{ color: "var(--muted)" }}>✕</button>
          </div>
        </div>

        {/* Side indicator */}
        <div
          className="text-center py-2 rounded-lg font-bold text-xl"
          style={{
            background: side === "yes" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            color: side === "yes" ? "var(--yes)" : "var(--no)",
            border: `1px solid ${side === "yes" ? "var(--yes)" : "var(--no)"}`,
          }}
        >
          {side.toUpperCase()} @ {price}¢
        </div>

        {/* Amount presets */}
        <div className="space-y-2">
          <label className="text-xs" style={{ color: "var(--muted)" }}>Amount (USD)</label>
          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className="flex-1 py-1.5 rounded text-sm font-medium transition-all"
                style={{
                  background: amount === p ? "var(--text)" : "var(--border)",
                  color: amount === p ? "var(--bg)" : "var(--text)",
                }}
              >
                ${p}
              </button>
            ))}
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="flex-1 rounded px-2 text-sm text-center"
              style={{ background: "var(--border)", color: "var(--text)", border: "none", outline: "none" }}
            />
          </div>
        </div>

        {/* Summary */}
        <div className="text-xs space-y-1" style={{ color: "var(--muted)" }}>
          <div className="flex justify-between">
            <span>Contracts</span>
            <span className="text-white">{contracts}</span>
          </div>
          <div className="flex justify-between">
            <span>Max payout</span>
            <span style={{ color: "var(--yes)" }}>${maxPayout}</span>
          </div>
        </div>

        {/* Action */}
        {status === "success" ? (
          <div className="text-center py-3 rounded-lg font-bold" style={{ background: "rgba(34,197,94,0.15)", color: "var(--yes)" }}>
            Bet placed ✓
          </div>
        ) : (
          <>
            {status === "error" && (
              <p className="text-xs text-center" style={{ color: "var(--no)" }}>{errMsg}</p>
            )}
            <button
              onClick={place}
              disabled={status === "loading" || contracts === 0}
              className="w-full py-3 rounded-xl font-bold text-sm transition-opacity disabled:opacity-40"
              style={{
                background: side === "yes" ? "var(--yes)" : "var(--no)",
                color: side === "yes" ? "#000" : "#fff",
              }}
            >
              {status === "loading" ? "Placing…" : `Place ${side.toUpperCase()} bet`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
