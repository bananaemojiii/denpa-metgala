"use client";

// Polls /api/fills every 10s and reconciles against the positions store.
// Handles fill price corrections and positions opened on other devices.
import { useEffect, useRef } from "react";
import { usePositionsStore } from "@/stores/positions";
import type { KalshiFill } from "@/app/api/fills/route";

const POLL_MS = 10_000;

export function useFillSync() {
  const reconcileFill = usePositionsStore((s) => s.reconcileFill);
  // Track the latest fill timestamp so each poll only fetches new fills
  const sinceRef = useRef<number>(Date.now() - 60 * 60 * 1000); // last 1hr on mount

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/fills?since=${sinceRef.current}`);
        if (!res.ok) return;
        const { fills } = await res.json() as { fills: KalshiFill[] };

        for (const fill of fills) {
          reconcileFill(fill);
          // Advance cursor past the latest fill we've seen
          const fillMs = new Date(fill.created_time).getTime();
          if (fillMs > sinceRef.current) sinceRef.current = fillMs + 1;
        }
      } catch {
        // network error — retry next tick
      } finally {
        timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    return () => clearTimeout(timer);
  }, [reconcileFill]);
}
