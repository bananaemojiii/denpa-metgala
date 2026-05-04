import { create } from "zustand";

export interface Arrival {
  id: string;
  celeb: string;
  designer: string;
  marketTicker: string;
  source: "ap-wire" | "x-stream" | "rss" | "manual";
  confidence: number;
  ts: number;
}

interface ArrivalsState {
  current: Arrival | null; // shown in ArrivalFlash
  history: Arrival[];
  push: (arrival: Arrival) => void;
  dismiss: () => void;
}

export const useArrivalsStore = create<ArrivalsState>((set) => ({
  current: null,
  history: [],

  push: (arrival) =>
    set((state) => ({
      current: arrival,
      history: [arrival, ...state.history].slice(0, 50),
    })),

  dismiss: () => set({ current: null }),
}));
