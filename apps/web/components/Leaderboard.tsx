"use client";

import { useEffect, useState } from "react";
import { useUserStore } from "@/stores/user";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

const POLL_MS = 8_000;

export function Leaderboard() {
  const username = useUserStore((s) => s.username);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch("/api/leaderboard");
        if (res.ok) {
          const data = await res.json() as { entries: LeaderboardEntry[] };
          setEntries(data.entries);
        }
      } finally {
        timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    return () => clearTimeout(timer);
  }, []);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs" style={{ color: "var(--muted)" }}>
        no trades yet — be first
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {entries.map((e, i) => {
        const isMe = e.username === username;
        const pnlDollars = (e.pnl / 100).toFixed(2);
        const positive = e.pnl >= 0;

        return (
          <div
            key={e.username}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs"
            style={{
              background: isMe ? "rgba(255,255,255,0.05)" : "transparent",
              border: isMe ? "1px solid var(--border)" : "1px solid transparent",
            }}
          >
            {/* Rank */}
            <span className="w-5 text-center font-bold tabular-nums"
              style={{ color: i < 3 ? "var(--yes)" : "var(--muted)" }}>
              {i + 1}
            </span>

            {/* Name */}
            <span className="flex-1 truncate font-medium" style={{ color: isMe ? "var(--text)" : "var(--muted)" }}>
              {e.username}{isMe ? " ●" : ""}
            </span>

            {/* Stats */}
            <span className="tabular-nums" style={{ color: "var(--muted)" }}>
              {e.wins}W {e.losses}L
            </span>

            {/* P&L */}
            <span className="tabular-nums font-bold w-16 text-right"
              style={{ color: positive ? "var(--yes)" : "var(--no)" }}>
              {positive ? "+" : ""}${pnlDollars}
            </span>
          </div>
        );
      })}
    </div>
  );
}
