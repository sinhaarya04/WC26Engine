/**
 * useDeadline — bracket submission deadline, driven by server time.
 *
 * On mount we fetch GET /deadline once, capture (serverNow - clientNow) as
 * an offset, then tick locally every second. `isOpen` is computed strictly
 * (now < deadline) so the boundary T===deadline is *closed*, matching the
 * backend's `>=` reject in PUT /predictions/bracket. The raw browser clock
 * is only ever consulted *via* the offset — never directly for the
 * open/closed decision.
 */
import { useEffect, useRef, useState } from "react";
import { getDeadline } from "./api";

export interface DeadlineState {
  /** True once the initial GET /deadline has resolved. */
  loaded: boolean;
  /** Parsed deadline as a Date once loaded; null before first response. */
  deadline: Date | null;
  /** Server-adjusted now < deadline. While !loaded we optimistically treat as open. */
  isOpen: boolean;
  /** Math.max(0, deadline - serverAdjustedNow). Infinity while !loaded. */
  msRemaining: number;
  /** API failure message; null if no error. */
  error: string | null;
}

const INITIAL: DeadlineState = {
  loaded: false,
  deadline: null,
  isOpen: true,
  msRemaining: Number.POSITIVE_INFINITY,
  error: null,
};

export function useDeadline(): DeadlineState {
  const [state, setState] = useState<DeadlineState>(INITIAL);
  const offsetRef = useRef<number>(0); // serverTime - clientTime (ms)

  // ---- Fetch once + capture offset ----
  useEffect(() => {
    let cancelled = false;
    getDeadline()
      .then((res) => {
        if (cancelled) return;
        const deadline = new Date(res.deadline);
        const serverNowMs = new Date(res.serverNow).getTime();
        offsetRef.current = serverNowMs - Date.now();
        const adjustedNow = Date.now() + offsetRef.current;
        const ms = deadline.getTime() - adjustedNow;
        setState({
          loaded: true,
          deadline,
          isOpen: ms > 0,
          msRemaining: Math.max(0, ms),
          error: null,
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, loaded: true, error: err.message || "Failed to load deadline" }));
      });
    return () => { cancelled = true; };
  }, []);

  // ---- Tick locally off the captured offset ----
  useEffect(() => {
    if (!state.loaded || !state.deadline) return;
    const tick = () => {
      const adjustedNow = Date.now() + offsetRef.current;
      const ms = state.deadline!.getTime() - adjustedNow;
      setState((prev) => ({
        ...prev,
        isOpen: ms > 0,
        msRemaining: Math.max(0, ms),
      }));
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state.loaded, state.deadline]);

  return state;
}

/**
 * Format a remaining-ms count as "Xd Yh Zm Ws". Components <= 0 are
 * dropped from the left until we hit minutes (which always render so the
 * label doesn't suddenly shrink to a bare seconds counter at the end).
 */
export function formatRemaining(msRemaining: number): string {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) return "0s";
  const totalSec = Math.floor(msRemaining / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (d > 0 || h > 0) parts.push(`${String(h).padStart(2, "0")}h`);
  parts.push(`${String(m).padStart(2, "0")}m`);
  parts.push(`${String(s).padStart(2, "0")}s`);
  return parts.join(" ");
}
