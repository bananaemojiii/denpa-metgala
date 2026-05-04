"use client";

import { useEffect } from "react";
import { useArrivalsStore } from "@/stores/arrivals";
import { useMarketsStore } from "@/stores/markets";

// Auto-dismisses after 4s. Also pins the matching market.
export function ArrivalFlash() {
  const { current, dismiss } = useArrivalsStore();
  const pinMarket = useMarketsStore((s) => s.pinMarket);

  useEffect(() => {
    if (!current) return;
    pinMarket(current.marketTicker);
    const t = setTimeout(dismiss, 4000);
    return () => clearTimeout(t);
  }, [current, dismiss, pinMarket]);

  if (!current) return null;

  const confidence = Math.round(current.confidence * 100);
  const sourceLabel = {
    "ap-wire": "AP Wire",
    "x-stream": "X",
    rss: "RSS",
    manual: "Manual",
  }[current.source];

  return (
    <div
      className="absolute bottom-4 left-4 right-4 rounded-xl p-3 slide-in z-10 cursor-pointer"
      style={{ background: "rgba(17,17,17,0.95)", border: "1px solid var(--border)" }}
      onClick={dismiss}
    >
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span>{sourceLabel} · {confidence}% confidence</span>
      </div>
      <div className="mt-1 text-sm font-bold">
        {current.celeb}{current.designer ? ` · ${current.designer}` : ""}
      </div>
      <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
        Market surfaced ↗
      </div>
    </div>
  );
}
