"use client";

import { useEffect, useRef, useState } from "react";
import { useMarketsStore, sortedMarkets } from "@/stores/markets";
import { useArrivalsStore } from "@/stores/arrivals";
import { usePositionsStore, totalPnl } from "@/stores/positions";
import { useUserStore } from "@/stores/user";
import { KalshiWS } from "@/lib/kalshi-ws";
import { useFillSync } from "@/lib/fill-sync";
import { MarketCard } from "./MarketCard";
import { Leaderboard } from "./Leaderboard";
import { METGALA_MARKETS } from "@/stores/markets";
import type { ResolutionEvent } from "@/app/api/admin/resolve/route";

interface Props {
  onBet: (ticker: string, side: "yes" | "no") => void;
}

type Tab = "markets" | "leaders";

export function MarketSidebar({ onBet }: Props) {
  const [tab, setTab] = useState<Tab>("markets");
  const { markets, applyTick, setResolution } = useMarketsStore();
  const pushArrival = useArrivalsStore((s) => s.push);
  const positions = usePositionsStore((s) => s.positions);
  const settlePosition = usePositionsStore((s) => s.settlePosition);
  const username = useUserStore((s) => s.username);
  const wsRef = useRef<KalshiWS | null>(null);

  useFillSync();

  // Kalshi WebSocket — live price ticks
  useEffect(() => {
    const tickers = METGALA_MARKETS.map((m) => m.ticker);
    wsRef.current = new KalshiWS(tickers, applyTick);
    wsRef.current.connect();
    return () => wsRef.current?.destroy();
  }, [applyTick]);

  // SSE — arrival + resolution events
  useEffect(() => {
    const es = new EventSource("/api/events");

    es.addEventListener("arrival", (ev) => {
      try { pushArrival(JSON.parse(ev.data)); } catch { /* skip */ }
    });

    es.addEventListener("resolution", (ev) => {
      try {
        const e = JSON.parse(ev.data) as ResolutionEvent;
        setResolution(e.ticker, e.resolution, e.outcome);

        if (e.resolution === "settled") {
          // Snapshot positions before settling (state update is async)
          const open = positions.filter(
            (p) => p.ticker === e.ticker && p.status === "open"
          );
          open.forEach((p) => {
            const won = p.side === e.outcome;
            settlePosition(p.id, won);

            // Report to leaderboard
            if (username) {
              fetch("/api/leaderboard", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  username,
                  ticker: e.ticker,
                  side: p.side,
                  contracts: p.contracts,
                  fillPrice: p.avgPrice,
                  outcome: e.outcome,
                }),
              }).catch(() => {/* fire and forget */});
            }
          });

          // Switch to leaderboard tab when a market settles
          if (open.length > 0) setTab("leaders");
        }
      } catch { /* skip */ }
    });

    return () => es.close();
  }, [pushArrival, setResolution, positions, settlePosition, username]);

  const sorted = sortedMarkets(markets);
  const pnl = totalPnl(positions);

  return (
    <aside className="flex flex-col h-full overflow-hidden"
      style={{ borderLeft: "1px solid var(--border)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 text-xs shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex gap-3">
          {(["markets", "leaders"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="font-bold tracking-widest uppercase text-xs transition-colors"
              style={{ color: tab === t ? "var(--text)" : "var(--muted)" }}
            >
              {t}
            </button>
          ))}
        </div>
        {positions.length > 0 && (
          <span className="font-bold tabular-nums"
            style={{ color: pnl >= 0 ? "var(--yes)" : "var(--no)" }}>
            {pnl >= 0 ? "+" : ""}${(pnl / 100).toFixed(2)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "markets" ? (
          <div className="space-y-2 p-2">
            {sorted.map((m) => (
              <MarketCard key={m.ticker} market={m} onBet={onBet} />
            ))}
          </div>
        ) : (
          <Leaderboard />
        )}
      </div>
    </aside>
  );
}
