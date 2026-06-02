/**
 * Tests for validateBracketSubmission — pure cascade validator.
 *
 * Synthetic fixture: 48 deterministic teams (4 per group, 12 groups), 72
 * group matches (6 per group), 32 KO slot ids 73..104. Teams are deterministic
 * enough that the "right" picks per slot can be computed up-front and used
 * to construct a valid bracket. We then mutate one pick at a time to drive
 * the negative cases.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  validateBracketSubmission,
  type GroupPredInput,
  type KnockoutPredInput,
  type TeamInput,
  type GroupMatchMeta,
} from "./bracketValidator";
import { computeGroupStanding } from "../core/standings";
import { resolveBracket } from "../core/resolveBracket";
import type { RankedTeam, TeamRef } from "../core/types";

// ---------- Fixture builders ----------

const GROUP_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const;

function buildTeams(): TeamInput[] {
  const teams: TeamInput[] = [];
  let seedCounter = 1;
  for (const g of GROUP_LETTERS) {
    for (let pos = 1; pos <= 4; pos++) {
      teams.push({ id: `${g}${pos}`, group: g, seed: seedCounter++ });
    }
  }
  return teams;
}

/** 6 round-robin matches per group, ids assigned in deterministic order. */
function buildGroupMatches(): GroupMatchMeta[] {
  const out: GroupMatchMeta[] = [];
  let id = 1;
  for (const g of GROUP_LETTERS) {
    const pairs: Array<[string, string]> = [
      [`${g}1`, `${g}2`],
      [`${g}3`, `${g}4`],
      [`${g}1`, `${g}3`],
      [`${g}2`, `${g}4`],
      [`${g}1`, `${g}4`],
      [`${g}2`, `${g}3`],
    ];
    for (const [h, a] of pairs) {
      out.push({ id: id++, group: g, homeTeamId: h, awayTeamId: a });
    }
  }
  return out;
}

/** Group predictions that produce a clear 1/2/3/4 finish per group: position 1
 *  beats 2, 3, 4; position 2 beats 3, 4; position 3 beats 4. All 2-0. */
function buildGroupPicks(groupMatches: GroupMatchMeta[]): GroupPredInput[] {
  return groupMatches.map((m) => {
    const homePos = Number(m.homeTeamId.slice(1));
    const awayPos = Number(m.awayTeamId.slice(1));
    if (homePos < awayPos) return { matchId: m.id, homeScorePred: 2, awayScorePred: 0 };
    return { matchId: m.id, homeScorePred: 0, awayScorePred: 2 };
  });
}

/** Build the SAME-resolver-derived KO picks the user "should" submit. */
function buildKoPicks(
  teams: TeamInput[],
  groupMatches: GroupMatchMeta[],
  groupPicks: GroupPredInput[],
): { picks: KnockoutPredInput[]; expectedSlots: Map<number, { homeTeamId: string; awayTeamId: string }> } {
  const teamRefById = new Map<string, TeamRef>(
    teams.map((t) => [t.id, { id: t.id, group: t.group, seed: t.seed }]),
  );
  const groupPredById = new Map<number, GroupPredInput>(groupPicks.map((g) => [g.matchId, g]));
  const groupResults = groupMatches.map((m) => {
    const p = groupPredById.get(m.id)!;
    return {
      groupId: m.group,
      home: teamRefById.get(m.homeTeamId)!,
      away: teamRefById.get(m.awayTeamId)!,
      homeScore: p.homeScorePred,
      awayScore: p.awayScorePred,
    };
  });

  const standings: RankedTeam[][] = GROUP_LETTERS.map((g) => {
    const inGroup = teams.filter((t) => t.group === g).map((t) => teamRefById.get(t.id)!);
    return computeGroupStanding(g, inGroup, groupResults);
  });

  // Build picks by walking 73..104. For each slot pick the "home" team as
  // winner — it's deterministic and exercises the cascade.
  const picks: KnockoutPredInput[] = [];
  const expectedSlots = new Map<number, { homeTeamId: string; awayTeamId: string }>();
  const koResultsSoFar: Array<{ matchId: number; homeScore: number; awayScore: number; winnerTeamId: string }> = [];

  for (let id = 73; id <= 104; id++) {
    const bracket = resolveBracket(koResultsSoFar, standings);
    const slot = bracket.get(id)!;
    const home = slot.home!;
    const away = slot.away!;
    expectedSlots.set(id, { homeTeamId: home.id, awayTeamId: away.id });
    picks.push({
      matchId: id,
      homeScorePred: 1,
      awayScorePred: 0,
      winnerPickTeamId: home.id, // always pick the home side
    });
    koResultsSoFar.push({
      matchId: id, homeScore: 1, awayScore: 0, winnerTeamId: home.id,
    });
  }
  return { picks, expectedSlots };
}

// ---------- Shared fixture (built once) ----------

let TEAMS: TeamInput[];
let GROUP_MATCHES: GroupMatchMeta[];
let GROUP_PICKS: GroupPredInput[];
let KO_PICKS: KnockoutPredInput[];
let EXPECTED_SLOTS: Map<number, { homeTeamId: string; awayTeamId: string }>;

beforeAll(() => {
  TEAMS = buildTeams();
  GROUP_MATCHES = buildGroupMatches();
  GROUP_PICKS = buildGroupPicks(GROUP_MATCHES);
  const built = buildKoPicks(TEAMS, GROUP_MATCHES, GROUP_PICKS);
  KO_PICKS = built.picks;
  EXPECTED_SLOTS = built.expectedSlots;
});

// ---------- Happy path ----------

describe("validateBracketSubmission — happy path", () => {
  it("accepts a fully-cascade-consistent bracket and returns 32 derivedSlots", () => {
    const result = validateBracketSubmission(GROUP_PICKS, KO_PICKS, TEAMS, GROUP_MATCHES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.derivedSlots.size).toBe(32);
    for (const [id, expected] of EXPECTED_SLOTS) {
      expect(result.derivedSlots.get(id)).toEqual(expected);
    }
  });
});

// ---------- Shape errors ----------

describe("validateBracketSubmission — shape", () => {
  it("rejects negative or non-integer group scores", () => {
    const bad = GROUP_PICKS.map((g) => (g.matchId === 1 ? { ...g, homeScorePred: -1 } : g));
    const r = validateBracketSubmission(bad, KO_PICKS, TEAMS, GROUP_MATCHES);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/group matchId=1.*non-negative integers/);
  });

  it("rejects missing winnerPickTeamId on a KO slot", () => {
    const bad = KO_PICKS.map((k) =>
      k.matchId === 73 ? { ...k, winnerPickTeamId: "" } : k,
    );
    const r = validateBracketSubmission(GROUP_PICKS, bad, TEAMS, GROUP_MATCHES);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/matchId=73.*winnerPickTeamId is required/);
  });
});

// ---------- Completeness ----------

describe("validateBracketSubmission — completeness", () => {
  it("rejects when a group prediction is missing", () => {
    const bad = GROUP_PICKS.filter((g) => g.matchId !== 5);
    const r = validateBracketSubmission(bad, KO_PICKS, TEAMS, GROUP_MATCHES);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/missing group prediction for matchId=5/);
  });

  it("rejects when a KO slot is missing", () => {
    const bad = KO_PICKS.filter((k) => k.matchId !== 91);
    const r = validateBracketSubmission(GROUP_PICKS, bad, TEAMS, GROUP_MATCHES);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/missing knockout prediction for matchId=91/);
  });

  it("rejects an unexpected extra group id", () => {
    const bad = [...GROUP_PICKS, { matchId: 9999, homeScorePred: 1, awayScorePred: 0 }];
    const r = validateBracketSubmission(bad, KO_PICKS, TEAMS, GROUP_MATCHES);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/unexpected group prediction for matchId=9999/);
  });

  it("rejects an unexpected extra KO id", () => {
    const bad = [...KO_PICKS, { matchId: 200, homeScorePred: 1, awayScorePred: 0, winnerPickTeamId: "A1" }];
    const r = validateBracketSubmission(GROUP_PICKS, bad, TEAMS, GROUP_MATCHES);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/unexpected knockout prediction for matchId=200/);
  });
});

// ---------- Cascade errors ----------

describe("validateBracketSubmission — cascade", () => {
  it("rejects a KO pick that is not one of the user's slot teams", () => {
    // Put a team that demonstrably isn't in slot 73 (the FIRST KO slot derives
    // its home/away from group standings — winners of two specific groups).
    const expected = EXPECTED_SLOTS.get(73)!;
    const wrongTeam = TEAMS.find(
      (t) => t.id !== expected.homeTeamId && t.id !== expected.awayTeamId,
    )!.id;
    const bad = KO_PICKS.map((k) =>
      k.matchId === 73 ? { ...k, winnerPickTeamId: wrongTeam } : k,
    );
    const r = validateBracketSubmission(GROUP_PICKS, bad, TEAMS, GROUP_MATCHES);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/slot 73: winnerPickTeamId .* is not one of the two teams/);
  });

  it("rejects an R16 pick inconsistent with the user's own earlier R32 winner", () => {
    // Take the slot-89 derived pair. Swap the R32 winners that feed it so the
    // expected R16 home/away changes, but leave the user's R16 pick (which
    // refers to a now-not-present team) unchanged.
    const expected89 = EXPECTED_SLOTS.get(89)!;
    // Find an R32 slot whose winner feeds M89 home. R16 M89 = winnerOf(M74).
    // Flip the user's M74 pick to the OTHER side; that changes the
    // expected M89 home and the M89 pick (which still names the original
    // M74 winner) should be rejected.
    const expected74 = EXPECTED_SLOTS.get(74)!;
    const flippedM74Pick = expected74.homeTeamId === expected89.homeTeamId
      ? expected74.awayTeamId
      : expected74.homeTeamId;

    const bad = KO_PICKS.map((k) =>
      k.matchId === 74 ? { ...k, winnerPickTeamId: flippedM74Pick } : k,
    );
    const r = validateBracketSubmission(GROUP_PICKS, bad, TEAMS, GROUP_MATCHES);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // The error should fire on slot 89 (or a later downstream slot), not 74.
    expect(r.errors.some((e) => /slot 89: winnerPickTeamId/.test(e))).toBe(true);
  });
});
