/**
 * useBracketDerivation — given the user's group score predictions, the
 * teams, and the user's KO winner picks made so far, derives the home/away
 * for every KO slot 73..104 via the vendored bracket engine.
 *
 * Mirrors the backend's server-side cascade exactly — the engine files are
 * byte-identical copies of api-usa/src/core. The backend remains the
 * source of truth on submit.
 *
 * Returns:
 *   bracket: Map<matchId, { home, away }>   — only slots whose feeders are
 *     determined have entries; unresolved slots are absent (or have
 *     undefined home/away).
 *   standingsByGroup: per-group rank rows the user's group picks produced.
 *   warning: a friendly message if the third-place table can't yet resolve
 *     (e.g. fewer than 12 groups have all matches predicted).
 */

import { useMemo } from "react";
import { computeGroupStanding } from "./bracketEngine/standings";
import { resolveBracket } from "./bracketEngine/resolveBracket";
import type { KnockoutResult, RankedTeam, TeamRef, BracketSlot } from "./bracketEngine/types";
import type { ApiMatch, ApiTeamSummary, GroupPredRow, KnockoutPredRow } from "./api";
import { isApiTeam } from "./api";

const GROUP_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const;

export interface DerivationInput {
  matches: ApiMatch[];
  teams: TeamSeed[];
  groupPreds: Map<number, GroupPredRow>;
  knockoutPicks: Map<number, KnockoutPredRow>;
}

export interface TeamSeed {
  id: string;
  name: string;
  fifa_code: string;
  group: string;
  seed: number;
}

export interface DerivationResult {
  bracket: Map<number, BracketSlot>;
  standingsByGroup: Map<string, RankedTeam[]>;
  teamById: Map<string, ApiTeamSummary>;
  teamRefById: Map<string, TeamRef>;
  /** Convenience: the team summaries indexed by id for display lookups. */
  groupMatches: ApiMatch[];
  knockoutMatches: ApiMatch[];
}

export function useBracketDerivation(input: DerivationInput): DerivationResult {
  const { matches, teams, groupPreds, knockoutPicks } = input;

  return useMemo<DerivationResult>(() => {
    const teamRefById = new Map<string, TeamRef>();
    const teamById = new Map<string, ApiTeamSummary>();
    for (const t of teams) {
      teamRefById.set(t.id, { id: t.id, group: t.group, seed: t.seed });
      teamById.set(t.id, { id: t.id, name: t.name, fifa_code: t.fifa_code, seed: t.seed });
    }

    const groupMatches = matches.filter((m) => m.type === "group");
    const knockoutMatches = matches.filter((m) => m.type !== "group");

    // Build GroupMatchResult[] from the user's filled-in group predictions.
    const groupResults = [];
    for (const m of groupMatches) {
      const p = groupPreds.get(m.id);
      if (!p || p.homeScorePred == null || p.awayScorePred == null) continue;
      if (!isApiTeam(m.home) || !isApiTeam(m.away) || !m.group) continue;
      const home = teamRefById.get(m.home.id);
      const away = teamRefById.get(m.away.id);
      if (!home || !away) continue;
      groupResults.push({
        groupId: m.group, home, away,
        homeScore: p.homeScorePred, awayScore: p.awayScorePred,
      });
    }

    const standingsByGroup = new Map<string, RankedTeam[]>();
    const allStandings: RankedTeam[][] = [];
    for (const g of GROUP_LETTERS) {
      const inGroup = teams
        .filter((t) => t.group === g)
        .map((t) => teamRefById.get(t.id)!);
      const standing = computeGroupStanding(g, inGroup, groupResults);
      standingsByGroup.set(g, standing);
      allStandings.push(standing);
    }

    // Gate the KO derivation on ALL 72 group matches being predicted.
    // Without this, the engine still produces deterministic standings (all
    // teams tied at 0/0/0 → falls through to seed order) and the R32 cards
    // would pre-fill with seed-ordered teams before the user picked any
    // group scores — confusing and unearned. We honour the same binary
    // gate the UI banner promises ("Fill in every group score above…").
    const groupsAllFilled = groupMatches.length > 0 && groupMatches.every((m) => {
      const p = groupPreds.get(m.id);
      return p && p.homeScorePred != null && p.awayScorePred != null;
    });
    if (!groupsAllFilled) {
      return {
        bracket: new Map<number, BracketSlot>(),
        standingsByGroup, teamById, teamRefById, groupMatches, knockoutMatches,
      };
    }

    // Build the user's KO picks as KnockoutResult-shaped inputs (dummy 0-0
    // scores, winnerTeamId from the user's pick). resolveBracket then
    // produces the cascading home/away/winner per slot — same as backend.
    const koResults: KnockoutResult[] = [];
    for (const k of knockoutPicks.values()) {
      if (!k.winnerPickTeamId) continue;
      koResults.push({
        matchId: k.matchId,
        homeScore: 0,
        awayScore: 0,
        winnerTeamId: k.winnerPickTeamId,
      });
    }

    const bracket = resolveBracket(koResults, allStandings);

    return { bracket, standingsByGroup, teamById, teamRefById, groupMatches, knockoutMatches };
  }, [matches, teams, groupPreds, knockoutPicks]);
}

// ---------- Helpers used by the view ----------

export function groupComplete(
  groupLetter: string,
  groupMatches: ApiMatch[],
  groupPreds: Map<number, GroupPredRow>,
): boolean {
  const inGroup = groupMatches.filter((m) => m.group === groupLetter);
  if (inGroup.length === 0) return false;
  return inGroup.every((m) => {
    const p = groupPreds.get(m.id);
    return p && p.homeScorePred != null && p.awayScorePred != null;
  });
}

export function allGroupsComplete(
  groupMatches: ApiMatch[],
  groupPreds: Map<number, GroupPredRow>,
): boolean {
  return GROUP_LETTERS.every((g) => groupComplete(g, groupMatches, groupPreds));
}
