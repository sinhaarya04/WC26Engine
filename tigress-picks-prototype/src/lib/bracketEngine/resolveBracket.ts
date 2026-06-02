/**
 * Pure bracket resolver.
 * Vendored from api-usa/src/core/resolveBracket.ts — keep in sync.
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
  thirdPlaceOverride?: ThirdPlaceAssignment;
}

export function resolveBracket(
  results: ReadonlyArray<KnockoutResult>,
  standings: ReadonlyArray<ReadonlyArray<RankedTeam>>,
  options: ResolveBracketOptions = {},
): Map<number, BracketSlot> {
  const bracket: Map<number, BracketSlot> = new Map();
  for (const id of ALL_KO_MATCH_IDS) bracket.set(id, {});

  const byGroup = buildGroupIndex(standings);
  const thirdAssignment = options.thirdPlaceOverride
    ?? (allGroupsComplete(standings) ? thirdPlaceAssignmentFor(standings) : null);

  const resultById = new Map<number, KnockoutResult>();
  for (const r of results) resultById.set(r.matchId, r);

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
    if (slot.home && slot.away) {
      const result = resultById.get(id);
      if (result) slot.winner = decideKnockoutWinner(result, slot.home, slot.away);
    }
    bracket.set(id, slot);
  }
  return bracket;
}

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
  if (!upstream.home || !upstream.away) return undefined;
  return upstream.winner.id === upstream.home.id ? upstream.away : upstream.home;
}

function decideKnockoutWinner(
  result: KnockoutResult,
  home: TeamRef,
  away: TeamRef,
): TeamRef | undefined {
  if (result.homeScore > result.awayScore) return home;
  if (result.homeScore < result.awayScore) return away;
  if (!result.winnerTeamId) return undefined;
  if (result.winnerTeamId === home.id) return home;
  if (result.winnerTeamId === away.id) return away;
  return undefined;
}
