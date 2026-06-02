/**
 * Dev-only auto-fill helpers for the bracket fill view.
 *
 * ⚠️  Imported only behind an `import.meta.env.DEV` gate. The component
 * that uses these is not rendered in production builds. Pure functions —
 * no side effects on their own; callers wire them to React state setters.
 *
 * Group auto-fill: random 0–4 each side, independent.
 * Knockout auto-fill: walks slots 73..104 in cascade order, derives
 *   home/away from the CURRENT (in-progress) set of picks via the same
 *   vendored resolveBracket the live preview uses, then picks a random
 *   winner + score for each. Knockouts can't draw — the winner is decided
 *   by the chosen side, not the random score.
 */

import { resolveBracket } from "./bracketEngine/resolveBracket";
import type { KnockoutResult, RankedTeam } from "./bracketEngine/types";
import type { ApiMatch, GroupPredRow, KnockoutPredRow } from "./api";
import { isApiTeam } from "./api";
import { ALL_KO_MATCH_IDS } from "./bracketEngine/bracketMap";

function randInt(maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive + 1));
}

/** Fill every group match with random non-negative scores 0..4 per side. */
export function randomGroupPreds(
  groupMatches: ReadonlyArray<ApiMatch>,
): Map<number, GroupPredRow> {
  const out = new Map<number, GroupPredRow>();
  for (const m of groupMatches) {
    if (!isApiTeam(m.home) || !isApiTeam(m.away)) continue;
    out.set(m.id, {
      matchId: m.id,
      homeScorePred: randInt(4),
      awayScorePred: randInt(4),
    });
  }
  return out;
}

/**
 * Walks 73..104 in cascade order. At each slot, derives home/away from the
 * picks accumulated so far (via the real engine), randomly picks a winner,
 * and generates a winning-side scoreline (winner 1–3, loser 0..winner-1).
 *
 * Returns a Map ready to drop into the bracket-fill state. Slots whose
 * upstream couldn't resolve (shouldn't happen when allStandings is
 * complete) are skipped silently.
 */
export function randomKnockoutPicks(
  allStandings: ReadonlyArray<ReadonlyArray<RankedTeam>>,
): Map<number, KnockoutPredRow> {
  const out = new Map<number, KnockoutPredRow>();
  const koResults: KnockoutResult[] = [];

  for (const id of ALL_KO_MATCH_IDS) {
    const bracket = resolveBracket(koResults, allStandings);
    const slot = bracket.get(id);
    if (!slot?.home || !slot.away) continue;

    const homeWins = Math.random() < 0.5;
    const winner = homeWins ? slot.home : slot.away;
    const winnerGoals = 1 + randInt(2);                   // 1..3
    const loserGoals  = randInt(Math.max(0, winnerGoals - 1)); // 0..winnerGoals-1

    out.set(id, {
      matchId: id,
      homeScorePred: homeWins ? winnerGoals : loserGoals,
      awayScorePred: homeWins ? loserGoals  : winnerGoals,
      winnerPickTeamId: winner.id,
      predHomeTeamId: slot.home.id,
      predAwayTeamId: slot.away.id,
    });

    koResults.push({
      matchId: id,
      homeScore: 0, awayScore: 0,
      winnerTeamId: winner.id,
    });
  }
  return out;
}
