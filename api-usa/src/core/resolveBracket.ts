/**
 * Pure bracket resolver.
 *
 * Inputs:
 *   • `results`   — completed knockout match results (any subset of 73–104)
 *   • `standings` — computed standings for each of the 12 groups
 *
 * Output: a Map keyed by every knockout match id 73–104, holding whatever is
 * currently known: home and/or away if their feeders are determined, and
 * `winner` only when a result definitively decides it.
 *
 * Determinism: identical inputs always produce identical output. The function
 * is pure — no DB, no I/O, no time-dependent state.
 *
 * Two callers share this resolver:
 *   1. Real bracket  — `results` are admin-entered match results.
 *   2. Predicted bracket — `results` are a single user's KO predictions.
 *
 * Knockout draws are not allowed: when scores are level, the result MUST
 * carry a `winnerTeamId`. If it doesn't (e.g. a user predicted a draw and
 * didn't pick a winner), the match's `winner` is left undefined and every
 * downstream slot fed by its winner stays unresolved. The resolver NEVER
 * guesses past a missing or ambiguous result.
 */

import type { BracketSlot, KnockoutResult, RankedTeam, TeamRef } from "./types";
import {
  R32_FEEDERS,
  KO_FEEDERS,
  ALL_KO_MATCH_IDS,
  type R32Feeder,
  type KOFeeder,
} from "./bracketMap";
import {
  resolveThirdPlaceAssignment,
  type GroupLetter,
  type ThirdPlaceAssignment,
  type ThirdPlaceMatchId,
} from "./thirdPlaceTable";
import { rankThirdPlaces } from "./thirdPlace";

const R32_RANGE = { start: 73, end: 88 } as const;

export interface ResolveBracketOptions {
  /**
   * Optional admin override for the third-place R32 slot assignment. When
   * provided, it is used as-is in place of the solver. Callers MUST validate
   * that its eight groups match the actual best-eight qualifying thirds —
   * this resolver does NOT cross-check standings against the override.
   */
  thirdPlaceOverride?: ThirdPlaceAssignment;
}

export function resolveBracket(
  results: ReadonlyArray<KnockoutResult>,
  standings: ReadonlyArray<ReadonlyArray<RankedTeam>>,
  options: ResolveBracketOptions = {},
): Map<number, BracketSlot> {
  const bracket: Map<number, BracketSlot> = new Map();
  for (const id of ALL_KO_MATCH_IDS) bracket.set(id, {});

  // Group letter → that group's 4 ranked rows, when complete.
  const byGroup = buildGroupIndex(standings);

  // Third-place assignment.
  //   - If an override was passed, use it verbatim (caller validated).
  //   - Otherwise, run the solver — but only once all 12 groups have settled.
  const thirdAssignment = options.thirdPlaceOverride
    ?? (allGroupsComplete(standings) ? thirdPlaceAssignmentFor(standings) : null);

  // Look up results by match id once.
  const resultById = new Map<number, KnockoutResult>();
  for (const r of results) resultById.set(r.matchId, r);

  // Walk match ids in order. R32 feeders come from group standings;
  // R16+ feeders come from upstream slots in this same map.
  for (const id of ALL_KO_MATCH_IDS) {
    const slot = bracket.get(id) ?? {};

    if (id >= R32_RANGE.start && id <= R32_RANGE.end) {
      const [feedHome, feedAway] = R32_FEEDERS[id];
      slot.home = resolveR32Feeder(feedHome, byGroup, thirdAssignment, id);
      slot.away = resolveR32Feeder(feedAway, byGroup, thirdAssignment, id);
    } else {
      const [feedHome, feedAway] = KO_FEEDERS[id];
      slot.home = resolveKOFeeder(feedHome, bracket);
      slot.away = resolveKOFeeder(feedAway, bracket);
    }

    // Apply a result only when both sides are known. If either side is still
    // unresolved we have nothing to score against; leave winner undefined.
    if (slot.home && slot.away) {
      const result = resultById.get(id);
      if (result) {
        slot.winner = decideKnockoutWinner(result, slot.home, slot.away);
      }
    }

    bracket.set(id, slot);
  }

  return bracket;
}

// ---------- helpers ----------

function buildGroupIndex(
  standings: ReadonlyArray<ReadonlyArray<RankedTeam>>,
): Map<string, ReadonlyArray<RankedTeam>> {
  const out = new Map<string, ReadonlyArray<RankedTeam>>();
  for (const groupStandings of standings) {
    if (groupStandings.length === 0) continue;
    const letter = groupStandings[0].team.group;
    out.set(letter, groupStandings);
  }
  return out;
}

function allGroupsComplete(
  standings: ReadonlyArray<ReadonlyArray<RankedTeam>>,
): boolean {
  return standings.length === 12 && standings.every((s) => s.length === 4);
}

function thirdPlaceAssignmentFor(
  standings: ReadonlyArray<ReadonlyArray<RankedTeam>>,
): ThirdPlaceAssignment {
  const top8 = rankThirdPlaces(standings);
  const groups = top8.map((r) => r.team.group as GroupLetter);
  return resolveThirdPlaceAssignment(groups);
}

function resolveR32Feeder(
  feeder: R32Feeder,
  byGroup: Map<string, ReadonlyArray<RankedTeam>>,
  thirdAssignment: ThirdPlaceAssignment | null,
  matchId: number,
): TeamRef | undefined {
  if (feeder.kind === "winner") {
    return byGroup.get(feeder.group)?.find((r) => r.rank === 1)?.team;
  }
  if (feeder.kind === "runnerUp") {
    return byGroup.get(feeder.group)?.find((r) => r.rank === 2)?.team;
  }
  // kind === "third"
  if (!thirdAssignment) return undefined;
  const groupLetter = thirdAssignment[matchId as ThirdPlaceMatchId];
  if (!groupLetter) return undefined;
  return byGroup.get(groupLetter)?.find((r) => r.rank === 3)?.team;
}

function resolveKOFeeder(
  feeder: KOFeeder,
  bracket: Map<number, BracketSlot>,
): TeamRef | undefined {
  const upstream = bracket.get(feeder.matchId);
  if (!upstream || !upstream.winner) return undefined;
  if (feeder.kind === "winnerOf") return upstream.winner;
  // loserOf — need both sides known to identify the non-winner.
  if (!upstream.home || !upstream.away) return undefined;
  return upstream.winner.id === upstream.home.id ? upstream.away : upstream.home;
}

/**
 * Resolve a single knockout match's winner from its result.
 *
 * - If the home side scored more: home wins.
 * - If the away side scored more: away wins.
 * - If scores are level: use `winnerTeamId` (advanced after ET/pens).
 * - If scores are level AND winnerTeamId is absent OR doesn't match either
 *   team: return undefined. The caller treats this as "unresolved" and
 *   downstream slots stay unfilled. We do NOT guess.
 */
function decideKnockoutWinner(
  result: KnockoutResult,
  home: TeamRef,
  away: TeamRef,
): TeamRef | undefined {
  if (result.homeScore > result.awayScore) return home;
  if (result.homeScore < result.awayScore) return away;
  // Level on score — KO can't draw; the recorded winner advances.
  if (!result.winnerTeamId) return undefined;
  if (result.winnerTeamId === home.id) return home;
  if (result.winnerTeamId === away.id) return away;
  // winnerTeamId mismatches both — caller's data is inconsistent. Don't guess.
  return undefined;
}
