import { create } from "zustand";
import type { KalshiTick } from "@/lib/kalshi-ws";

export type ResolutionState = "open" | "resolving" | "provisional" | "settled";

export interface Market {
  ticker: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  resolution: ResolutionState;
  outcome?: "yes" | "no";
  // last tick timestamp for flash animation key
  flashKey: number;
  flashDir: "up" | "down" | null;
  pinned: boolean; // creator pinned this market to top
}

interface MarketsState {
  markets: Market[];
  setMarkets: (markets: Market[]) => void;
  applyTick: (tick: KalshiTick) => void;
  pinMarket: (ticker: string) => void;
  setResolution: (ticker: string, state: ResolutionState, outcome?: "yes" | "no") => void;
}

// Seeded Met Gala 2026 markets — swap tickers for real Kalshi slugs
export const METGALA_MARKETS: Omit<Market, "flashKey" | "flashDir" | "pinned">[] = [
  { ticker: "METGALA26-ZENDAYA-LOEWE", title: "Will Zendaya wear Loewe?", yesPrice: 68, noPrice: 32, volume: 0, resolution: "open" },
  { ticker: "METGALA26-BEST-DRESSED", title: "Best Dressed: Zendaya wins?", yesPrice: 41, noPrice: 59, volume: 0, resolution: "open" },
  { ticker: "METGALA26-RIHANNA-APPEAR", title: "Will Rihanna appear?", yesPrice: 55, noPrice: 45, volume: 0, resolution: "open" },
  { ticker: "METGALA26-VALENTINO-CARPET", title: "Valentino dresses most celebs?", yesPrice: 30, noPrice: 70, volume: 0, resolution: "open" },
  { ticker: "METGALA26-THEME-LITERAL", title: "Most literal theme interpretation wins best dressed?", yesPrice: 48, noPrice: 52, volume: 0, resolution: "open" },
  { ticker: "METGALA26-SURPRISE-COUPLE", title: "Surprise couple reveal on carpet?", yesPrice: 22, noPrice: 78, volume: 0, resolution: "open" },
];

export const useMarketsStore = create<MarketsState>((set) => ({
  markets: METGALA_MARKETS.map((m) => ({ ...m, flashKey: 0, flashDir: null, pinned: false })),

  setMarkets: (markets) => set({ markets }),

  applyTick: (tick) =>
    set((state) => ({
      markets: state.markets.map((m) => {
        if (m.ticker !== tick.marketTicker) return m;
        const dir = tick.yesPrice > m.yesPrice ? "up" : tick.yesPrice < m.yesPrice ? "down" : null;
        return {
          ...m,
          yesPrice: tick.yesPrice,
          noPrice: tick.noPrice,
          volume: tick.volume,
          flashKey: tick.ts,
          flashDir: dir,
        };
      }),
    })),

  pinMarket: (ticker) =>
    set((state) => ({
      markets: state.markets.map((m) =>
        m.ticker === ticker ? { ...m, pinned: !m.pinned } : m
      ),
    })),

  setResolution: (ticker, resolution, outcome) =>
    set((state) => ({
      markets: state.markets.map((m) =>
        m.ticker === ticker ? { ...m, resolution, outcome } : m
      ),
    })),
}));

// Sorted view: pinned first, then by volume desc
export function sortedMarkets(markets: Market[]) {
  return [...markets].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.volume - a.volume;
  });
}
