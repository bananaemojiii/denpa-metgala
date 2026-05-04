"use client";

import { useState } from "react";
import { StreamPlayer } from "@/components/StreamPlayer";
import { MarketSidebar } from "@/components/MarketSidebar";
import { ArrivalFlash } from "@/components/ArrivalFlash";
import { BetSheet } from "@/components/BetSheet";
import { UsernameGate } from "@/components/UsernameGate";
import { usePositionsStore } from "@/stores/positions";

const PLAYBACK_ID = process.env.NEXT_PUBLIC_MUX_PLAYBACK_ID ?? "";

export default function Home() {
  const [bet, setBet] = useState<{ ticker: string; side: "yes" | "no" } | null>(null);
  const positions = usePositionsStore((s) => s.positions);

  return (
    <div className="flex flex-col h-screen">
      <UsernameGate>
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-4 py-2 shrink-0 text-xs"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <span className="font-bold tracking-tight text-base">denpa</span>
            <span
              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-bold uppercase"
              style={{ background: "rgba(239,68,68,0.15)", color: "var(--no)", border: "1px solid var(--no)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
            <span style={{ color: "var(--muted)" }}>Met Gala 2026</span>
          </div>
          {positions.length > 0 && (
            <span style={{ color: "var(--muted)" }}>
              {positions.length} position{positions.length !== 1 ? "s" : ""}
            </span>
          )}
        </header>

        {/* Main: stream + sidebar */}
        <div className="flex flex-1 overflow-hidden">
          <main className="relative flex-1 min-w-0 bg-black">
            {PLAYBACK_ID ? (
              <StreamPlayer playbackId={PLAYBACK_ID} />
            ) : (
              <div
                className="flex items-center justify-center h-full text-sm"
                style={{ color: "var(--muted)" }}
              >
                Set NEXT_PUBLIC_MUX_PLAYBACK_ID to connect stream
              </div>
            )}
            <ArrivalFlash />
          </main>

          {/* Sidebar — fixed 320px on desktop */}
          <div className="hidden md:flex flex-col" style={{ width: 320 }}>
            <MarketSidebar onBet={(ticker, side) => setBet({ ticker, side })} />
          </div>
        </div>

        {/* Mobile: market strip below stream */}
        <div
          className="md:hidden shrink-0 overflow-y-auto"
          style={{ borderTop: "1px solid var(--border)", maxHeight: "45vh" }}
        >
          <MarketSidebar onBet={(ticker, side) => setBet({ ticker, side })} />
        </div>

        {bet && (
          <BetSheet
            ticker={bet.ticker}
            side={bet.side}
            onClose={() => setBet(null)}
          />
        )}
      </UsernameGate>
    </div>
  );
}
