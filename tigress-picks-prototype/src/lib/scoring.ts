/**
 * Pure scoring. Tiered: highest applicable bucket wins (not additive).
 *   +5  exact score
 *   +3  correct winner (or correct draw)
 *   +1  correct goal differential
 *    0  miss
 * Lock-of-the-day doubles the result; clamped at >= 0.
 */

import type { Match, Prediction } from "../types";

export type ScoreOutcome = "exact" | "winner" | "goalDiff" | "miss";

export interface ScoreBreakdown {
  base: number;
  multiplier: 1 | 2;
  total: number;
  outcome: ScoreOutcome;
}

function sign(a: number, b: number): "H" | "A" | "D" {
  if (a > b) return "H";
  if (a < b) return "A";
  return "D";
}

export function scorePrediction(
  pred: Pick<Prediction, "home" | "away" | "locked">,
  result: { home: number; away: number },
): ScoreBreakdown {
  let base = 0;
  let outcome: ScoreOutcome = "miss";

  if (pred.home === result.home && pred.away === result.away) {
    base = 5;
    outcome = "exact";
  } else if (sign(pred.home, pred.away) === sign(result.home, result.away)) {
    base = 3;
    outcome = "winner";
  } else if (pred.home - pred.away === result.home - result.away) {
    base = 1;
    outcome = "goalDiff";
  }

  const multiplier: 1 | 2 = pred.locked ? 2 : 1;
  const total = Math.max(0, base * multiplier);
  return { base, multiplier, total, outcome };
}

/** Sum points for a user across all settled matches. Returns total + counts. */
export function tallyUser(
  userId: string,
  matches: ReadonlyArray<Match>,
  predictions: ReadonlyArray<Prediction>,
): { points: number; exact: number; winner: number } {
  let points = 0;
  let exact = 0;
  let winner = 0;
  for (const m of matches) {
    if (m.status !== "SETTLED" || !m.result) continue;
    const p = predictions.find((x) => x.userId === userId && x.matchId === m.id);
    if (!p) continue;
    const s = scorePrediction(p, m.result);
    points += s.total;
    if (s.outcome === "exact") exact++;
    else if (s.outcome === "winner") winner++;
  }
  return { points, exact, winner };
}
