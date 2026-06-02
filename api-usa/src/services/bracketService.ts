/**
 * Bracket service. Two callers of the same pure `resolveBracket`:
 *
 *   • `buildRealBracket(matches, teams, options?)`   — admin-entered results
 *   • `buildMyBracket(matches, teams, predictions)`  — a user's predictions
 *
 * Both functions:
 *   1. Translate DB-shaped inputs into pure types `resolveBracket` expects.
 *   2. Compute standings for all 12 groups via `computeGroupStanding`.
 *   3. Call `resolveBracket` to populate the 73–104 map.
 *   4. Resolve team ids to `{ id, name, fifa_code }` for the response.
 *
 * `buildRealBracket` ALSO accepts an optional third-place override. If the
 * override's eight groups match the actual best-eight qualifying thirds,
 * the override is applied verbatim. If they don't match, the override is
 * ignored, the solver is used, and a `warning` is surfaced on the response
 * so the admin sees the conflict — never silently swallowed.
 *
 * `buildMyBracket` is UNAFFECTED by overrides — predicted brackets ALWAYS
 * use the solver.
 *
 * No scoring happens here. Knockout scoring still uses `scorePrediction`.
 */

import { computeGroupStanding } from "../core/standings";
import { resolveBracket } from "../core/resolveBracket";
import { rankThirdPlaces } from "../core/thirdPlace";
import type {
  GroupMatchResult,
  KnockoutResult,
  RankedTeam,
  TeamRef,
  BracketSlot,
} from "../core/types";
import type {
  GroupLetter,
  ThirdPlaceAssignment,
  ThirdPlaceMatchId,
} from "../core/thirdPlaceTable";

const ALL_GROUP_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
] as const;

// ---------- DB-shaped input types ----------

export interface TeamData {
  id: string;
  name: string;
  fifa_code: string;
  group: string;
  seed: number;
}

export interface MatchData {
  id: number;
  type: "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";
  group?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  finished: boolean;
  winnerTeamId?: string | null;
}

export interface PredictionData {
  matchId: number;
  homeScorePred: number | null;
  awayScorePred: number | null;
}

// ---------- Response shape ----------

export interface TeamSummary {
  id: string;
  name: string;
  fifa_code: string;
}

export interface BracketEntry {
  matchId: number;
  type: "r32" | "r16" | "qf" | "sf" | "third" | "final";
  home?: TeamSummary;
  away?: TeamSummary;
  winner?: TeamSummary;
}

export interface BracketResponse {
  bracket: BracketEntry[];
  /** Set when an admin override exists but conflicts with actual standings,
   *  or whenever else the resolver wants to surface something for admin
   *  attention. Absent on the happy path. */
  warning?: string;
  /** "override" when an admin override was applied to the third-place slots;
   *  "solver" otherwise. Only populated for the real bracket; predicted
   *  brackets omit this field. */
  thirdPlaceSource?: "override" | "solver";
}

// ---------- Options ----------

export interface RealBracketOptions {
  /** Admin-set third-place R32 assignment. Reconciled against actual
   *  standings before being applied. */
  thirdPlaceOverride?: {
    assignments: Readonly<Record<ThirdPlaceMatchId, GroupLetter>>;
  };
}

// ---------- Real bracket: admin-entered results ----------

export function buildRealBracket(
  matches: ReadonlyArray<MatchData>,
  teams: ReadonlyArray<TeamData>,
  options: RealBracketOptions = {},
): BracketResponse {
  const teamRefById = teamRefIndex(teams);
  const groupResults: GroupMatchResult[] = [];
  const koResults: KnockoutResult[] = [];

  for (const m of matches) {
    if (!m.finished) continue;
    if (m.homeScore == null || m.awayScore == null) continue;

    if (m.type === "group") {
      const res = toGroupResult(m, m.homeScore, m.awayScore, teamRefById);
      if (res) groupResults.push(res);
    } else {
      koResults.push({
        matchId: m.id,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        winnerTeamId: m.winnerTeamId ?? undefined,
      });
    }
  }

  const allStandings = computeAllStandings(teams, groupResults);

  // Reconcile any admin override against the actual standings.
  let activeOverride: ThirdPlaceAssignment | undefined;
  let warning: string | undefined;
  let thirdPlaceSource: "override" | "solver" = "solver";

  if (options.thirdPlaceOverride) {
    const reconciliation = reconcileOverride(
      options.thirdPlaceOverride.assignments,
      allStandings,
    );
    if (reconciliation.kind === "apply") {
      activeOverride = reconciliation.assignments;
      thirdPlaceSource = "override";
    } else if (reconciliation.kind === "conflict") {
      warning = reconciliation.reason;
      // Surface in server logs too, per "do NOT silently use the override".
      // eslint-disable-next-line no-console
      console.warn(`[bracketService] third-place override conflict: ${reconciliation.reason}`);
    }
    // kind === "defer" → standings incomplete; silently fall back to solver
    // (which itself does nothing until all groups are complete).
  }

  const bracket = resolveBracket(koResults, allStandings, {
    thirdPlaceOverride: activeOverride,
  });

  const response = formatBracketResponse(bracket, matches, teams);
  response.thirdPlaceSource = thirdPlaceSource;
  if (warning) response.warning = warning;
  return response;
}

// ---------- User-predicted bracket ----------

export function buildMyBracket(
  matches: ReadonlyArray<MatchData>,
  teams: ReadonlyArray<TeamData>,
  predictions: ReadonlyArray<PredictionData>,
): BracketResponse {
  const teamRefById = teamRefIndex(teams);
  const predByMatch = new Map<number, PredictionData>();
  for (const p of predictions) predByMatch.set(p.matchId, p);

  const groupResults: GroupMatchResult[] = [];
  const koResults: KnockoutResult[] = [];

  for (const m of matches) {
    const p = predByMatch.get(m.id);
    if (!p) continue;
    if (p.homeScorePred == null || p.awayScorePred == null) continue;

    if (m.type === "group") {
      const res = toGroupResult(m, p.homeScorePred, p.awayScorePred, teamRefById);
      if (res) groupResults.push(res);
    } else {
      // Predictions don't carry a winnerTeamId. Level scores → unresolved.
      koResults.push({
        matchId: m.id,
        homeScore: p.homeScorePred,
        awayScore: p.awayScorePred,
      });
    }
  }

  const allStandings = computeAllStandings(teams, groupResults);
  // Predicted brackets ALWAYS use the solver — admin overrides do not apply.
  const bracket = resolveBracket(koResults, allStandings);
  return formatBracketResponse(bracket, matches, teams);
}

// ---------- Override reconciliation ----------

type Reconciliation =
  | { kind: "apply"; assignments: ThirdPlaceAssignment }
  | { kind: "conflict"; reason: string }
  /** Standings aren't complete enough to validate — quietly use solver. */
  | { kind: "defer" };

function reconcileOverride(
  override: Readonly<Record<ThirdPlaceMatchId, GroupLetter>>,
  standings: ReadonlyArray<ReadonlyArray<RankedTeam>>,
): Reconciliation {
  if (!isAllGroupsComplete(standings)) return { kind: "defer" };

  const overrideGroups = new Set<GroupLetter>(Object.values(override));
  const actualThirds = rankThirdPlaces(standings);
  const actualGroups = new Set<GroupLetter>(
    actualThirds.map((r) => r.team.group as GroupLetter),
  );

  const sameSet =
    overrideGroups.size === actualGroups.size &&
    [...overrideGroups].every((g) => actualGroups.has(g));

  if (!sameSet) {
    const ovr = [...overrideGroups].sort().join(",");
    const act = [...actualGroups].sort().join(",");
    return {
      kind: "conflict",
      reason:
        `Third-place override is stale: override groups [${ovr}] ` +
        `don't match actual qualifying thirds [${act}]. ` +
        `Override ignored; using solver. Update the override via ` +
        `POST /admin/bracket/third-place-override.`,
    };
  }
  return { kind: "apply", assignments: override };
}

// ---------- internal helpers ----------

function teamRefIndex(teams: ReadonlyArray<TeamData>): Map<string, TeamRef> {
  const out = new Map<string, TeamRef>();
  for (const t of teams) out.set(t.id, { id: t.id, group: t.group, seed: t.seed });
  return out;
}

function toGroupResult(
  m: MatchData,
  homeScore: number,
  awayScore: number,
  teamRefById: Map<string, TeamRef>,
): GroupMatchResult | null {
  if (!m.homeTeamId || !m.awayTeamId || !m.group) return null;
  const home = teamRefById.get(m.homeTeamId);
  const away = teamRefById.get(m.awayTeamId);
  if (!home || !away) return null;
  return { groupId: m.group, home, away, homeScore, awayScore };
}

function computeAllStandings(
  teams: ReadonlyArray<TeamData>,
  groupResults: ReadonlyArray<GroupMatchResult>,
): RankedTeam[][] {
  const out: RankedTeam[][] = [];
  for (const letter of ALL_GROUP_LETTERS) {
    const inGroup = teams
      .filter((t) => t.group === letter)
      .map((t) => ({ id: t.id, group: t.group, seed: t.seed } as TeamRef));
    out.push(computeGroupStanding(letter, inGroup, groupResults));
  }
  return out;
}

function isAllGroupsComplete(
  standings: ReadonlyArray<ReadonlyArray<RankedTeam>>,
): boolean {
  if (standings.length !== 12) return false;
  return standings.every(
    (s) => s.length === 4 && s.every((row) => row.played > 0),
  );
}

function formatBracketResponse(
  bracket: Map<number, BracketSlot>,
  matches: ReadonlyArray<MatchData>,
  teams: ReadonlyArray<TeamData>,
): BracketResponse {
  const display = new Map<string, TeamSummary>();
  for (const t of teams) {
    display.set(t.id, { id: t.id, name: t.name, fifa_code: t.fifa_code });
  }
  const typeByMatch = new Map<number, BracketEntry["type"]>();
  for (const m of matches) {
    if (m.type === "group") continue;
    typeByMatch.set(m.id, m.type);
  }

  const entries: BracketEntry[] = [];
  for (const [matchId, slot] of bracket) {
    const t = typeByMatch.get(matchId) ?? defaultTypeForId(matchId);
    entries.push({
      matchId,
      type: t,
      home: slot.home ? display.get(slot.home.id) : undefined,
      away: slot.away ? display.get(slot.away.id) : undefined,
      winner: slot.winner ? display.get(slot.winner.id) : undefined,
    });
  }
  entries.sort((a, b) => a.matchId - b.matchId);
  return { bracket: entries };
}

function defaultTypeForId(id: number): BracketEntry["type"] {
  if (id <= 88)  return "r32";
  if (id <= 96)  return "r16";
  if (id <= 100) return "qf";
  if (id <= 102) return "sf";
  if (id === 103) return "third";
  return "final";
}
