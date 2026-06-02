/**
 * Integration tests for /bracket/real and /bracket/me, including the
 * third-place admin override behavior.
 *
 * Mocks the four Mongoose models the controllers depend on (Match, Team,
 * Prediction, BracketOverride) and invokes the handlers directly with a
 * mock req/res. This exercises the full controller → service →
 * resolveBracket → response path without a real Mongo connection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- Mocks (hoisted by vitest) ----------

vi.mock("../models/Match", () => ({
  Match: { find: vi.fn() },
}));
vi.mock("../models/team", () => ({
  Team: { find: vi.fn() },
}));
vi.mock("../models/Prediction", () => ({
  Prediction: { find: vi.fn() },
}));
vi.mock("../models/BracketOverride", () => ({
  BracketOverride: { findOne: vi.fn() },
}));

import { Match } from "../models/Match";
import { Team } from "../models/team";
import { Prediction } from "../models/Prediction";
import { BracketOverride } from "../models/BracketOverride";
import { getRealBracket, getMyBracket } from "./bracket.controller";
import { resolveThirdPlaceAssignment } from "../core/thirdPlaceTable";
import type {
  MatchData,
  PredictionData,
  TeamData,
  BracketResponse,
} from "../services/bracketService";

// ---------- Test fixtures ----------

const GROUPS = "ABCDEFGHIJKL".split("");

/** 48 synthetic teams, 12 groups × 4 pots. Seed is unique (1..48). */
function makeTeams(): TeamData[] {
  const teams: TeamData[] = [];
  let id = 1;
  for (const g of GROUPS) {
    for (let pot = 1; pot <= 4; pot++) {
      teams.push({
        id: String(id),
        name: `${g}-pot${pot}`,
        fifa_code: `${g}${pot}`,
        group: g,
        seed: id,
      });
      id++;
    }
  }
  return teams;
}

const TEAMS = makeTeams();

/** Lookup team id by group + pot. */
function teamId(group: string, pot: 1 | 2 | 3 | 4): string {
  const t = TEAMS.find((x) => x.group === group && x.fifa_code === `${group}${pot}`);
  if (!t) throw new Error(`team not found: ${group}/pot${pot}`);
  return t.id;
}

/**
 * Build all 72 group matches with deterministic results: pot 1 beats every
 * other team, pot 2 beats 3 and 4, pot 3 beats 4. Result: 1st=pot1, 2nd=pot2,
 * 3rd=pot3, 4th=pot4 in every group.
 *
 * Optional `weakerThirdInGroup` blows up the pot-1 vs pot-3 score for that
 * group so its pot-3 team's GD becomes much worse — used by the conflict
 * test to flip which eight thirds qualify.
 */
function makeFinishedGroupMatches(opts: { weakerThirdInGroup?: string } = {}): MatchData[] {
  const out: MatchData[] = [];
  let id = 1;
  for (const g of GROUPS) {
    const pairs: Array<[1 | 2 | 3 | 4, 1 | 2 | 3 | 4]> = [
      [1, 2], [3, 4],
      [1, 3], [2, 4],
      [1, 4], [2, 3],
    ];
    for (const [hi, ai] of pairs) {
      const homeWins = hi < ai;
      const blowOut = opts.weakerThirdInGroup === g && hi === 1 && ai === 3;
      const homeScore = blowOut ? 5 : (homeWins ? 2 : 0);
      const awayScore = blowOut ? 0 : (homeWins ? 0 : 2);
      out.push({
        id: id++,
        type: "group",
        group: g,
        homeTeamId: teamId(g, hi),
        awayTeamId: teamId(g, ai),
        finished: true,
        homeScore,
        awayScore,
        winnerTeamId: null,
      });
    }
  }
  return out;
}

function koMatchType(id: number): MatchData["type"] {
  if (id <= 88)  return "r32";
  if (id <= 96)  return "r16";
  if (id <= 100) return "qf";
  if (id <= 102) return "sf";
  if (id === 103) return "third";
  return "final";
}

function makeFinishedKOMatches(): MatchData[] {
  const out: MatchData[] = [];
  for (let id = 73; id <= 104; id++) {
    out.push({
      id, type: koMatchType(id),
      finished: true, homeScore: 1, awayScore: 0, winnerTeamId: null,
    });
  }
  return out;
}

function makeUnfinishedKOMatches(): MatchData[] {
  return makeFinishedKOMatches().map((m) => ({
    ...m, finished: false, homeScore: null, awayScore: null,
  }));
}

function makeUnfinishedGroupMatches(): MatchData[] {
  return makeFinishedGroupMatches().map((m) => ({
    ...m, finished: false, homeScore: null, awayScore: null,
  }));
}

function makeFullPredictions(allMatches: MatchData[]): PredictionData[] {
  return allMatches.map((m) => {
    if (m.type === "group") {
      const home = TEAMS.find((t) => t.id === m.homeTeamId)!;
      const away = TEAMS.find((t) => t.id === m.awayTeamId)!;
      const homePot = Number(home.fifa_code.slice(-1));
      const awayPot = Number(away.fifa_code.slice(-1));
      const homeWins = homePot < awayPot;
      return {
        matchId: m.id,
        homeScorePred: homeWins ? 2 : 0,
        awayScorePred: homeWins ? 0 : 2,
      };
    }
    return { matchId: m.id, homeScorePred: 1, awayScorePred: 0 };
  });
}

// ---------- Mongoose mock helpers ----------

type LeanReturn<T> = { lean: <U = T>() => Promise<U> };

function mockFind<T>(rows: T): LeanReturn<T> {
  return { lean: <U = T>() => Promise.resolve(rows as unknown as U) };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return res;
}

beforeEach(() => {
  vi.mocked(Match.find).mockReset();
  vi.mocked(Team.find).mockReset();
  vi.mocked(Prediction.find).mockReset();
  vi.mocked(BracketOverride.findOne).mockReset();
  // Default: no override on disk. Tests that need one override this.
  vi.mocked(BracketOverride.findOne).mockReturnValue(mockFind(null) as never);
});

// ---------- /bracket/real ----------

describe("GET /bracket/real (integration)", () => {
  it("populates the full bracket from finished matches (no override → solver)", async () => {
    const allMatches = [...makeFinishedGroupMatches(), ...makeFinishedKOMatches()];
    vi.mocked(Match.find).mockReturnValue(mockFind(allMatches) as never);
    vi.mocked(Team.find).mockReturnValue(mockFind(TEAMS) as never);

    const res = makeRes();
    await getRealBracket({} as never, res as never);

    expect(res.statusCode).toBe(200);
    const body = res.body as BracketResponse;
    expect(body.bracket.length).toBe(32);
    expect(body.thirdPlaceSource).toBe("solver");
    expect(body.warning).toBeUndefined();

    for (const entry of body.bracket) {
      expect(entry.home,   `match ${entry.matchId} has no home`).toBeDefined();
      expect(entry.away,   `match ${entry.matchId} has no away`).toBeDefined();
      expect(entry.winner, `match ${entry.matchId} has no winner`).toBeDefined();
    }

    // M73 = "Runner-up Group A" vs "Runner-up Group B" → pot-2 teams.
    const m73 = body.bracket.find((e) => e.matchId === 73)!;
    expect(m73.home!.id).toBe(teamId("A", 2));
    expect(m73.away!.id).toBe(teamId("B", 2));
  });

  it("leaves slots unresolved when groups aren't finished", async () => {
    const empty = [
      ...makeFinishedGroupMatches().map((m) => ({ ...m, finished: false, homeScore: null, awayScore: null })),
      ...makeUnfinishedKOMatches(),
    ];
    vi.mocked(Match.find).mockReturnValue(mockFind(empty) as never);
    vi.mocked(Team.find).mockReturnValue(mockFind(TEAMS) as never);

    const res = makeRes();
    await getRealBracket({} as never, res as never);

    const body = res.body as BracketResponse;
    for (const e of body.bracket) expect(e.winner).toBeUndefined();
    const m73 = body.bracket.find((e) => e.matchId === 73)!;
    expect(m73.home).toBeDefined();
    expect(m73.away).toBeDefined();
  });
});

// ---------- /bracket/me ----------

describe("GET /bracket/me (integration)", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = makeRes();
    await getMyBracket({} as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it("populates the predicted bracket from the user's predictions", async () => {
    const allMatches  = [...makeUnfinishedGroupMatches(), ...makeUnfinishedKOMatches()];
    const predictions = makeFullPredictions(allMatches);

    vi.mocked(Match.find).mockReturnValue(mockFind(allMatches) as never);
    vi.mocked(Team.find).mockReturnValue(mockFind(TEAMS) as never);
    vi.mocked(Prediction.find).mockReturnValue(mockFind(predictions) as never);

    const res = makeRes();
    await getMyBracket({ userId: "user-1" } as never, res as never);

    const body = res.body as BracketResponse;
    expect(body.bracket.length).toBe(32);
    // The override-only thirdPlaceSource field is absent on /me.
    expect(body.thirdPlaceSource).toBeUndefined();
    for (const e of body.bracket) {
      expect(e.home).toBeDefined();
      expect(e.away).toBeDefined();
      expect(e.winner).toBeDefined();
    }
    expect(vi.mocked(Prediction.find)).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("leaves predicted bracket unresolved past missing predictions", async () => {
    const allMatches  = [...makeUnfinishedGroupMatches(), ...makeUnfinishedKOMatches()];
    const predictions = makeFullPredictions(allMatches).filter((p) => p.matchId < 73);

    vi.mocked(Match.find).mockReturnValue(mockFind(allMatches) as never);
    vi.mocked(Team.find).mockReturnValue(mockFind(TEAMS) as never);
    vi.mocked(Prediction.find).mockReturnValue(mockFind(predictions) as never);

    const res = makeRes();
    await getMyBracket({ userId: "user-1" } as never, res as never);

    const body = res.body as BracketResponse;
    for (const e of body.bracket) expect(e.winner).toBeUndefined();
    const m73 = body.bracket.find((e) => e.matchId === 73)!;
    expect(m73.home).toBeDefined();
    expect(m73.away).toBeDefined();
  });
});

// ---------- Third-place admin override ----------

describe("third-place admin override", () => {
  /**
   * With identical pot-3 stats across groups, rankThirdPlaces falls through
   * to seed → group letter, and the top 8 thirds are exactly groups A–H.
   */
  const QUALIFYING_THIRDS_ABCDEFGH = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

  it("applies the override when its groups match actual qualifying thirds, and wins over the solver", async () => {
    const solverOutput = resolveThirdPlaceAssignment([...QUALIFYING_THIRDS_ABCDEFGH]);
    // Valid permutation that DIFFERS from the solver output. Each slot is
    // verified against SLOT_ELIGIBILITY for {A,B,C,D,E,F,G,H}.
    const overrideAssignments: Record<string, string> = {
      "74": "B", "77": "D", "79": "C", "80": "H",
      "81": "F", "82": "A", "85": "G", "87": "E",
    };
    expect(overrideAssignments["74"]).not.toBe(solverOutput[74]);

    const allMatches = [...makeFinishedGroupMatches(), ...makeFinishedKOMatches()];
    vi.mocked(Match.find).mockReturnValue(mockFind(allMatches) as never);
    vi.mocked(Team.find).mockReturnValue(mockFind(TEAMS) as never);
    vi.mocked(BracketOverride.findOne).mockReturnValue(
      mockFind({ assignments: overrideAssignments }) as never,
    );

    const res = makeRes();
    await getRealBracket({} as never, res as never);

    const body = res.body as BracketResponse;
    expect(body.thirdPlaceSource).toBe("override");
    expect(body.warning).toBeUndefined();

    // M74's away is the third-place slot. Override says group B → "B3".
    const m74 = body.bracket.find((e) => e.matchId === 74)!;
    expect(m74.away!.fifa_code).toBe("B3");
    // Solver would have said group A → "A3".
    expect(m74.away!.fifa_code).not.toBe("A3");

    // Spot-check another slot: M79 → override C → "C3"
    const m79 = body.bracket.find((e) => e.matchId === 79)!;
    expect(m79.away!.fifa_code).toBe("C3");
  });

  it("/bracket/me ignores the override entirely — predicted brackets always use the solver", async () => {
    const solverOutput = resolveThirdPlaceAssignment([...QUALIFYING_THIRDS_ABCDEFGH]);
    const overrideAssignments: Record<string, string> = {
      "74": "B", "77": "D", "79": "C", "80": "H",
      "81": "F", "82": "A", "85": "G", "87": "E",
    };

    const allMatches  = [...makeUnfinishedGroupMatches(), ...makeUnfinishedKOMatches()];
    const predictions = makeFullPredictions(allMatches);
    vi.mocked(Match.find).mockReturnValue(mockFind(allMatches) as never);
    vi.mocked(Team.find).mockReturnValue(mockFind(TEAMS) as never);
    vi.mocked(Prediction.find).mockReturnValue(mockFind(predictions) as never);
    // Even with an override sitting in storage…
    vi.mocked(BracketOverride.findOne).mockReturnValue(
      mockFind({ assignments: overrideAssignments }) as never,
    );

    const res = makeRes();
    await getMyBracket({ userId: "user-1" } as never, res as never);

    const body = res.body as BracketResponse;
    // …the predicted bracket follows the solver, not the override.
    const m74 = body.bracket.find((e) => e.matchId === 74)!;
    expect(m74.away!.fifa_code).toBe(`${solverOutput[74]}3`);
    expect(body.thirdPlaceSource).toBeUndefined();
    expect(body.warning).toBeUndefined();
  });

  it("rejects a stale override (groups don't match actual qualifying thirds), surfaces a warning, falls back to solver", async () => {
    // Knock group H's third-placed team into much worse GD so the top-8
    // thirds become A,B,C,D,E,F,G,I instead of A..H.
    const allMatches = [
      ...makeFinishedGroupMatches({ weakerThirdInGroup: "H" }),
      ...makeFinishedKOMatches(),
    ];
    // Override still uses the OLD combination (ABCDEFGH) — stale.
    const staleOverride: Record<string, string> = {
      "74": "A", "77": "C", "79": "F", "80": "H",
      "81": "B", "82": "E", "85": "G", "87": "D",
    };
    vi.mocked(Match.find).mockReturnValue(mockFind(allMatches) as never);
    vi.mocked(Team.find).mockReturnValue(mockFind(TEAMS) as never);
    vi.mocked(BracketOverride.findOne).mockReturnValue(
      mockFind({ assignments: staleOverride }) as never,
    );

    const res = makeRes();
    await getRealBracket({} as never, res as never);

    const body = res.body as BracketResponse;
    expect(body.thirdPlaceSource).toBe("solver");
    expect(body.warning).toBeDefined();
    expect(body.warning).toMatch(/stale|don't match|qualifying thirds/i);

    // The bracket itself must still be valid — every R32 third-place slot
    // filled, and using the solver's assignment for the REAL qualifying set
    // {A,B,C,D,E,F,G,I}. Group H's third must NOT appear.
    const thirdSlotIds = [74, 77, 79, 80, 81, 82, 85, 87];
    for (const id of thirdSlotIds) {
      const entry = body.bracket.find((e) => e.matchId === id)!;
      expect(entry.away).toBeDefined();
      expect(entry.away!.fifa_code).toMatch(/[A-L]3$/);
      expect(entry.away!.fifa_code).not.toBe("H3");
    }
  });

  it("falls back to the solver silently when no override is present (existing behavior unchanged)", async () => {
    const allMatches = [...makeFinishedGroupMatches(), ...makeFinishedKOMatches()];
    vi.mocked(Match.find).mockReturnValue(mockFind(allMatches) as never);
    vi.mocked(Team.find).mockReturnValue(mockFind(TEAMS) as never);
    // BracketOverride.findOne returns null by default (set in beforeEach).

    const res = makeRes();
    await getRealBracket({} as never, res as never);

    const body = res.body as BracketResponse;
    expect(body.thirdPlaceSource).toBe("solver");
    expect(body.warning).toBeUndefined();

    const solverOutput = resolveThirdPlaceAssignment([...QUALIFYING_THIRDS_ABCDEFGH]);
    const m74 = body.bracket.find((e) => e.matchId === 74)!;
    expect(m74.away!.fifa_code).toBe(`${solverOutput[74]}3`);
  });
});
