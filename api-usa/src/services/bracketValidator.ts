/**
 * bracketValidator — pure cascade validator for an up-front bracket submission.
 *
 * Inputs:
 *   - groups: 72 group-stage score predictions (matchId 1..72 — IDs supplied
 *     by the seed; the validator accepts the set passed in)
 *   - knockouts: 32 KO slot predictions (matchId 73..104)
 *   - teams: the full Team list (for standings + matchup derivation)
 *   - groupMatches: raw group Match docs (for group-id lookup of the 72 ids
 *     that ARE group matches, so the validator stays decoupled from the
 *     literal range 1..72)
 *
 * Validates:
 *   - shape: every score / pick is the right type and non-negative
 *   - completeness: all expected group + KO slot ids are present, no extras
 *   - cascade: each KO slot's winnerPickTeamId matches one of the two
 *     teams that the user's own bracket places in that slot
 *
 * On success returns { ok: true, derivedSlots } where derivedSlots is a Map
 * matchId → { homeTeamId, awayTeamId } for every KO slot — used by the
 * submit handler to persist predHome/AwayTeamId on each Prediction row.
 *
 * Pure: no DB, no I/O, no time-dependent state. Reuses the verified
 * resolveBracket / computeGroupStanding / thirdPlace logic — does NOT
 * reimplement any of it.
 */

import { computeGroupStanding } from "../core/standings";
import { resolveBracket } from "../core/resolveBracket";
import type { GroupMatchResult, KnockoutResult, RankedTeam, TeamRef } from "../core/types";

// ---------- Public input/output shapes ----------

export interface GroupPredInput {
  matchId: number;
  homeScorePred: number;
  awayScorePred: number;
}

export interface KnockoutPredInput {
  matchId: number;
  homeScorePred: number;
  awayScorePred: number;
  winnerPickTeamId: string;
}

export interface TeamInput {
  id: string;
  group: string;
  seed: number;
}

export interface GroupMatchMeta {
  id: number;
  group: string;
  homeTeamId: string;
  awayTeamId: string;
}

export interface ValidationOk {
  ok: true;
  derivedSlots: Map<number, { homeTeamId: string; awayTeamId: string }>;
}

export interface ValidationFail {
  ok: false;
  errors: string[];
}

export type ValidationResult = ValidationOk | ValidationFail;

// ---------- Constants ----------

const KO_IDS: ReadonlyArray<number> = Array.from({ length: 32 }, (_, i) => 73 + i);

// ---------- Helpers ----------

function isNonNegInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

// ---------- Validator ----------

export function validateBracketSubmission(
  groups: ReadonlyArray<GroupPredInput>,
  knockouts: ReadonlyArray<KnockoutPredInput>,
  teams: ReadonlyArray<TeamInput>,
  groupMatches: ReadonlyArray<GroupMatchMeta>,
): ValidationResult {
  const errors: string[] = [];

  // ---------- 1. Shape ----------
  for (const g of groups) {
    if (!Number.isInteger(g.matchId)) errors.push(`group: invalid matchId ${String(g.matchId)}`);
    if (!isNonNegInt(g.homeScorePred) || !isNonNegInt(g.awayScorePred)) {
      errors.push(`group matchId=${g.matchId}: scores must be non-negative integers`);
    }
  }
  for (const k of knockouts) {
    if (!Number.isInteger(k.matchId)) errors.push(`knockout: invalid matchId ${String(k.matchId)}`);
    if (!isNonNegInt(k.homeScorePred) || !isNonNegInt(k.awayScorePred)) {
      errors.push(`knockout matchId=${k.matchId}: scores must be non-negative integers`);
    }
    if (typeof k.winnerPickTeamId !== "string" || k.winnerPickTeamId.length === 0) {
      errors.push(`knockout matchId=${k.matchId}: winnerPickTeamId is required`);
    }
  }
  if (errors.length) return { ok: false, errors };

  // ---------- 2. Completeness ----------
  const groupMatchIds = new Set(groupMatches.map((m) => m.id));
  const expectedGroupIds = [...groupMatchIds].sort((a, b) => a - b);
  const submittedGroupIds = new Set(groups.map((g) => g.matchId));

  for (const id of expectedGroupIds) {
    if (!submittedGroupIds.has(id)) errors.push(`missing group prediction for matchId=${id}`);
  }
  for (const id of submittedGroupIds) {
    if (!groupMatchIds.has(id)) errors.push(`unexpected group prediction for matchId=${id}`);
  }
  if (submittedGroupIds.size !== expectedGroupIds.length && errors.length === 0) {
    errors.push(`expected ${expectedGroupIds.length} group predictions, got ${submittedGroupIds.size}`);
  }

  const submittedKoIds = new Set(knockouts.map((k) => k.matchId));
  for (const id of KO_IDS) {
    if (!submittedKoIds.has(id)) errors.push(`missing knockout prediction for matchId=${id}`);
  }
  for (const id of submittedKoIds) {
    if (!KO_IDS.includes(id)) errors.push(`unexpected knockout prediction for matchId=${id}`);
  }
  if (errors.length) return { ok: false, errors };

  // ---------- 3. Build team refs + group results from user's group picks ----------
  const teamRefById = new Map<string, TeamRef>();
  for (const t of teams) teamRefById.set(t.id, { id: t.id, group: t.group, seed: t.seed });

  const groupById = new Map<number, GroupMatchMeta>();
  for (const m of groupMatches) groupById.set(m.id, m);

  const groupPredById = new Map<number, GroupPredInput>();
  for (const g of groups) groupPredById.set(g.matchId, g);

  const groupResults: GroupMatchResult[] = [];
  for (const gm of groupMatches) {
    const p = groupPredById.get(gm.id)!;
    const home = teamRefById.get(gm.homeTeamId);
    const away = teamRefById.get(gm.awayTeamId);
    if (!home || !away) {
      errors.push(`group matchId=${gm.id}: unknown team id in fixture (${gm.homeTeamId} / ${gm.awayTeamId})`);
      continue;
    }
    groupResults.push({
      groupId: gm.group,
      home, away,
      homeScore: p.homeScorePred,
      awayScore: p.awayScorePred,
    });
  }
  if (errors.length) return { ok: false, errors };

  // ---------- 4. Standings via real service ----------
  const groupLetters = Array.from(new Set(teams.map((t) => t.group))).sort();
  const allStandings: RankedTeam[][] = [];
  for (const g of groupLetters) {
    const inGroup = teams
      .filter((t) => t.group === g)
      .map((t) => teamRefById.get(t.id)!);
    allStandings.push(computeGroupStanding(g, inGroup, groupResults));
  }
  if (allStandings.length !== 12) {
    return { ok: false, errors: [`expected 12 groups, got ${allStandings.length}`] };
  }

  // ---------- 5. Cascade walk ----------
  // Feed the user's KO picks into resolveBracket as KnockoutResults with the
  // winnerTeamId forced to the user's pick (and dummy 0-0 scores so the
  // resolver uses the winnerTeamId branch, not score comparison). This way
  // the cascade for slots 73..104 reuses the SAME resolver the real bracket
  // uses — single source of truth.
  //
  // We progressively grow the results list slot-by-slot so the resolver only
  // sees decided upstream slots when it resolves a given downstream slot.
  // resolveBracket itself walks in order; passing all picks at once works
  // because each slot only depends on earlier slots in the canonical order.
  const knockoutPredById = new Map<number, KnockoutPredInput>();
  for (const k of knockouts) knockoutPredById.set(k.matchId, k);

  // First pass: resolve with NO KO results — gives us R32 home/away from
  // standings. Validate every R32 pick belongs to {home, away}, then add it.
  // Then resolve again with R32 picks recorded; validate R16; etc.
  const koResults: KnockoutResult[] = [];
  const derivedSlots = new Map<number, { homeTeamId: string; awayTeamId: string }>();

  for (const id of KO_IDS) {
    const bracket = resolveBracket(koResults, allStandings);
    const slot = bracket.get(id);
    const home = slot?.home;
    const away = slot?.away;
    if (!home || !away) {
      errors.push(
        `slot ${id}: could not derive teams from your bracket (upstream slot unresolved)`,
      );
      // Skip this slot — downstream slots fed by it will likely also fail.
      // We still keep going to surface all errors at once.
      continue;
    }

    const pick = knockoutPredById.get(id)!;
    if (pick.winnerPickTeamId !== home.id && pick.winnerPickTeamId !== away.id) {
      errors.push(
        `slot ${id}: winnerPickTeamId ${pick.winnerPickTeamId} is not one of the two teams in your bracket (${home.id} or ${away.id})`,
      );
    } else {
      // Feed this pick forward so downstream slots resolve correctly.
      koResults.push({
        matchId: id,
        homeScore: 0,
        awayScore: 0,
        winnerTeamId: pick.winnerPickTeamId,
      });
    }
    derivedSlots.set(id, { homeTeamId: home.id, awayTeamId: away.id });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, derivedSlots };
}
