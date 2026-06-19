"use client";

// Wraps MarketChat with a compact market selector and two presentations:
//   • desktop → inline panel filling the sidebar content area
//   • mobile  → full-height sheet (reuses the BetSheet/UsernameGate modal idiom)
//
// Only ONE MarketChat is ever mounted (breakpoint-selected) so polling/optimistic
// state never runs twice. Keyed by ticker — switching markets switches threads.
import { useEffect, useRef, useState } from "react";
import { useMarketsStore, sortedMarkets } from "@/stores/markets";
import { MarketChat } from "./MarketChat";

interface Props {
  onClose: () => void; // returns the sidebar to the markets tab (mobile sheet close)
}

// Short, readable label from a ticker like METGALA26-ZENDAYA-LOEWE → ZENDAYA-LOEWE.
function shortLabel(ticker: string): string {
  const parts = ticker.split("-");
  return parts.length > 2 ? parts.slice(1).join("-") : ticker;
}

// Tracks the md breakpoint. Safe here: the surface only mounts after a click,
// well after hydration, so there's no SSR mismatch.
function useIsDesktop(): boolean {
  // Synchronous initial read avoids a one-frame full-screen sheet flash on
  // desktop (the surface only mounts on click, so window is always available).
  const [desktop, setDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

// On mobile, pin the sheet to the visual viewport so the keyboard never covers
// the composer. Feature-detected; falls back to 100dvh via CSS when absent.
function useVisualViewportStyle(enabled: boolean): React.CSSProperties {
  const [style, setStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      setStyle({
        height: `${vv.height}px`,
        transform: `translateY(${vv.offsetTop}px)`,
      });
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [enabled]);
  return style;
}

function MarketSelector({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (ticker: string) => void;
}) {
  const markets = useMarketsStore((s) => s.markets);
  const sorted = sortedMarkets(markets);
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rowRef}
      className="shrink-0 flex gap-1.5 overflow-x-auto px-3 py-2"
      style={{ borderBottom: "1px solid var(--border)", scrollbarWidth: "none" }}
    >
      {sorted.map((m) => {
        const on = m.ticker === selected;
        return (
          <button
            key={m.ticker}
            onClick={() => onSelect(m.ticker)}
            title={m.title}
            className="shrink-0 px-2 py-1 rounded text-[11px] font-bold uppercase tracking-wide transition-colors"
            style={{
              background: on ? "var(--text)" : "var(--surface)",
              color: on ? "var(--bg)" : "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            {shortLabel(m.ticker)}
          </button>
        );
      })}
    </div>
  );
}

export function MarketChatSurface({ onClose }: Props) {
  const markets = useMarketsStore((s) => s.markets);
  const sorted = sortedMarkets(markets);
  const [selected, setSelected] = useState<string>(() => sorted[0]?.ticker ?? "");
  const isDesktop = useIsDesktop();
  const sheetStyle = useVisualViewportStyle(!isDesktop);

  const market = markets.find((m) => m.ticker === selected);
  if (!selected || !market) {
    return (
      <div className="p-4 text-xs" style={{ color: "var(--muted)" }}>
        no markets available
      </div>
    );
  }

  const contextHeader = (
    <div
      className="shrink-0 flex items-center justify-between gap-2 px-3 py-2"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <span className="text-xs font-medium truncate">{market.title}</span>
      <span
        className="shrink-0 text-xs font-bold tabular-nums"
        style={{ color: "var(--yes)" }}
      >
        {market.yesPrice}¢
      </span>
    </div>
  );

  // Desktop: inline panel inside the sidebar's content area.
  if (isDesktop) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <MarketSelector selected={selected} onSelect={setSelected} />
        {contextHeader}
        <div className="flex-1 min-h-0">
          <MarketChat ticker={selected} active />
        </div>
      </div>
    );
  }

  // Mobile: full-height sheet that escapes the cramped 45vh strip.
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col slide-in"
      style={{ background: "var(--bg)", height: "100dvh", ...sheetStyle }}
    >
      <div
        className="shrink-0 flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="font-bold tracking-widest uppercase text-xs">chat</span>
        <button
          onClick={onClose}
          aria-label="close chat"
          className="text-lg leading-none px-2 -mr-2"
          style={{ color: "var(--muted)" }}
        >
          ✕
        </button>
      </div>
      <MarketSelector selected={selected} onSelect={setSelected} />
      {contextHeader}
      <div className="flex-1 min-h-0">
        <MarketChat ticker={selected} active />
      </div>
    </div>
  );
}
