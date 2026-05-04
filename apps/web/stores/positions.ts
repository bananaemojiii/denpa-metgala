import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Position {
  id: string;           // Kalshi order_id
  tradeId?: string;     // Kalshi trade_id from fill (set after sync)
  ticker: string;
  marketTitle: string;
  side: "yes" | "no";
  contracts: number;
  avgPrice: number;     // cents — updated to actual fill price on sync
  placedAt: number;
  status: "open" | "settled_win" | "settled_loss";
}

interface PositionsState {
  positions: Position[];
  addPosition: (pos: Position) => void;
  settlePosition: (id: string, won: boolean) => void;
  // Reconciles a Kalshi fill against existing positions.
  // If the order is already tracked, updates avgPrice and tradeId.
  // If unknown (placed on another device), inserts as a new open position.
  reconcileFill: (fill: {
    trade_id: string;
    order_id: string;
    ticker: string;
    side: "yes" | "no";
    count: number;
    yes_price: number;
    no_price: number;
  }) => void;
}

export const usePositionsStore = create<PositionsState>()(
  persist(
    (set, get) => ({
      positions: [],

      addPosition: (pos) =>
        set((state) => ({ positions: [pos, ...state.positions] })),

      settlePosition: (id, won) =>
        set((state) => ({
          positions: state.positions.map((p) =>
            p.id === id ? { ...p, status: won ? "settled_win" : "settled_loss" } : p
          ),
        })),

      reconcileFill: (fill) => {
        const state = get();
        const existing = state.positions.find((p) => p.id === fill.order_id);
        const fillPrice = fill.side === "yes" ? fill.yes_price : fill.no_price;

        if (existing) {
          // Update fill price if it differs from the optimistic estimate
          if (existing.tradeId === fill.trade_id) return; // already synced
          set((s) => ({
            positions: s.positions.map((p) =>
              p.id === fill.order_id
                ? { ...p, tradeId: fill.trade_id, avgPrice: fillPrice }
                : p
            ),
          }));
        } else {
          // Position opened on another device — import it
          set((s) => ({
            positions: [
              {
                id: fill.order_id,
                tradeId: fill.trade_id,
                ticker: fill.ticker,
                marketTitle: fill.ticker, // resolved later if market is in store
                side: fill.side,
                contracts: fill.count,
                avgPrice: fillPrice,
                placedAt: Date.now(),
                status: "open",
              },
              ...s.positions,
            ],
          }));
        }
      },
    }),
    {
      name: "denpa-positions",
      // Only persist fields needed to survive a page refresh
      partialize: (state) => ({ positions: state.positions }),
    }
  )
);

export function totalPnl(positions: Position[]): number {
  return positions
    .filter((p) => p.status !== "open")
    .reduce((acc, p) => {
      const payout = p.status === "settled_win" ? 100 : 0;
      return acc + (payout - p.avgPrice) * p.contracts;
    }, 0);
}
