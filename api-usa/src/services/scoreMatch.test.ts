/**
 * Tests for scoreMatch — the "score this match against everyone's
 * predictions" service.
 *
 * Cases:
 *   (a) group match — scores straight from Match doc, no buildRealBracket call
 *   (b) KO match with all feeders complete — matchup is derived from
 *       buildRealBracket, predictions score correctly
 *   (c) KO match with a missing feeder — DEFERS cleanly: no Score writes,
 *       returns { status: "deferred" }
 *   (d) entering the missing feeder lets scoreMatch self-correct on the
 *       next attempt (proves rescore semantics work after deferral)
 *
 * Mocks Match, Team, Prediction, Score + buildRealBracket. scorePrediction
 * is the real one (we want to confirm scoreMatch wires it correctly).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/Match", () => ({
  Match: { findOne: vi.fn(), find: vi.fn() },
}));
vi.mock("../models/team", () => ({
  Team: { find: vi.fn() },
}));
vi.mock("../models/Prediction", () => ({
  Prediction: { find: vi.fn() },
}));
vi.mock("../models/Score", () => ({
  Score: { updateOne: vi.fn() },
}));
vi.mock("./bracketService", () => ({
  buildRealBracket: vi.fn(),
}));

import { Match } from "../models/Match";
import { Team } from "../models/team";
import { Prediction } from "../models/Prediction";
import { Score } from "../models/Score";
import { buildRealBracket } from "./bracketService";
import { scoreMatch } from "./scoreMatch";

// ---------- helpers ----------

function mockLean<T>(value: T) {
  return { lean: () => Promise.resolve(value) };
}

const USER_A = "user-A";
const USER_B = "user-B";

beforeEach(() => {
  vi.mocked(Match.findOne).mockReset();
  vi.mocked(Match.find).mockReset();
  vi.mocked(Team.find).mockReset();
  vi.mocked(Prediction.find).mockReset();
  vi.mocked(Score.updateOne).mockReset();
  vi.mocked(buildRealBracket).mockReset();
  // Score.updateOne resolves to a benign object for every call.
  vi.mocked(Score.updateOne).mockResolvedValue({} as never);
});

// ---------------------------------------------------------------------------
// (a) Group match — scores from Match doc, no buildRealBracket call
// ---------------------------------------------------------------------------

describe("scoreMatch — (a) group match", () => {
  it("scores straight from the Match doc; never calls buildRealBracket", async () => {
    // Match 1: USA 2-1 MEX (finished).
    vi.mocked(Match.findOne).mockResolvedValue({
      id: 1, type: "group", finished: true, homeScore: 2, awayScore: 1,
      homeTeamId: "USA", awayTeamId: "MEX", winnerTeamId: null,
    } as never);
    vi.mocked(Prediction.find).mockResolvedValue([
      { userId: USER_A, matchId: 1, homeScorePred: 2, awayScorePred: 1 }, // exact
      { userId: USER_B, matchId: 1, homeScorePred: 1, awayScorePred: 1 }, // wrong outcome
    ] as never);

    const result = await scoreMatch(1);

    expect(result).toEqual({ status: "scored", matchId: 1, count: 2 });
    expect(vi.mocked(buildRealBracket)).not.toHaveBeenCalled();
    // Two Score upserts written, in user order.
    expect(vi.mocked(Score.updateOne)).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(Score.updateOne).mock.calls;
    const setForA = calls.find((c) => (c[0] as { userId: string }).userId === USER_A)![1] as { $set: { points: number; exact: boolean } };
    expect(setForA.$set.points).toBe(12);   // group exact = 5+4+3
    expect(setForA.$set.exact).toBe(true);
    const setForB = calls.find((c) => (c[0] as { userId: string }).userId === USER_B)![1] as { $set: { points: number } };
    expect(setForB.$set.points).toBe(0);    // 1-1 prediction vs 2-1 actual: wrong outcome
  });
});

// ---------------------------------------------------------------------------
// (b) KO match with all feeders complete — matchup derived from bracket
// ---------------------------------------------------------------------------

describe("scoreMatch — (b) KO match, feeders complete", () => {
  it("derives actual matchup from buildRealBracket and scores correctly", async () => {
    // M73: real bracket says ENG (home) vs FRA (away); ENG wins 2-1.
    // The Match doc has NO homeTeamId/awayTeamId — they're not persisted
    // for KO matches in this codebase. Derivation must fill them in.
    vi.mocked(Match.findOne).mockResolvedValue({
      id: 73, type: "r32", finished: true, homeScore: 2, awayScore: 1,
      homeTeamId: null, awayTeamId: null, winnerTeamId: null,
    } as never);
    vi.mocked(Match.find).mockReturnValue(mockLean([]) as never);
    vi.mocked(Team.find).mockReturnValue(mockLean([]) as never);
    vi.mocked(buildRealBracket).mockReturnValue({
      bracket: [{ matchId: 73, type: "r32",
        home: { id: "ENG", name: "England", fifa_code: "ENG" },
        away: { id: "FRA", name: "France",  fifa_code: "FRA" },
      }],
    } as never);

    // Two users:
    //   A: predicted ENG/FRA 2-1 ENG → exact + correct advancer → 14
    //   B: predicted ITA/GER 2-1 ITA → wrong matchup, ITA didn't advance → 0
    vi.mocked(Prediction.find).mockResolvedValue([
      { userId: USER_A, matchId: 73, homeScorePred: 2, awayScorePred: 1,
        winnerPickTeamId: "ENG", predHomeTeamId: "ENG", predAwayTeamId: "FRA" },
      { userId: USER_B, matchId: 73, homeScorePred: 2, awayScorePred: 1,
        winnerPickTeamId: "ITA", predHomeTeamId: "ITA", predAwayTeamId: "GER" },
    ] as never);

    const result = await scoreMatch(73);

    expect(result).toEqual({ status: "scored", matchId: 73, count: 2 });
    expect(vi.mocked(buildRealBracket)).toHaveBeenCalledTimes(1);

    const calls = vi.mocked(Score.updateOne).mock.calls;
    const a = calls.find((c) => (c[0] as { userId: string }).userId === USER_A)![1] as { $set: { points: number; exact: boolean; advancement: boolean } };
    expect(a.$set.points).toBe(14);
    expect(a.$set.exact).toBe(true);
    expect(a.$set.advancement).toBe(true);
    const b = calls.find((c) => (c[0] as { userId: string }).userId === USER_B)![1] as { $set: { points: number; exact: boolean; advancement: boolean } };
    expect(b.$set.points).toBe(0);            // wrong matchup → no components
    expect(b.$set.exact).toBe(false);
    expect(b.$set.advancement).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (c) KO match with missing feeder — DEFER cleanly, no Score writes
// ---------------------------------------------------------------------------

describe("scoreMatch — (c) KO match with missing feeder", () => {
  it("returns { status: 'deferred' } and writes NO Score rows", async () => {
    vi.mocked(Match.findOne).mockResolvedValue({
      id: 89, type: "r16", finished: true, homeScore: 3, awayScore: 0,
      homeTeamId: null, awayTeamId: null, winnerTeamId: null,
    } as never);
    vi.mocked(Match.find).mockReturnValue(mockLean([]) as never);
    vi.mocked(Team.find).mockReturnValue(mockLean([]) as never);
    // Bracket can't resolve M89's slot because upstream R32 (M74/M77) aren't
    // finished yet — return the slot without home/away.
    vi.mocked(buildRealBracket).mockReturnValue({
      bracket: [{ matchId: 89, type: "r16" /* home + away undefined */ }],
    } as never);

    const result = await scoreMatch(89);

    expect(result).toEqual({
      status: "deferred",
      matchId: 89,
      reason: "upstream feeders not yet resolved",
    });
    // CRUCIAL: not a single Score write. No zeros, no anything.
    expect(vi.mocked(Score.updateOne)).not.toHaveBeenCalled();
    // We also never even bothered to query predictions — deferral short-circuits.
    expect(vi.mocked(Prediction.find)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (d) Self-correction: feeder lands, re-run, defer→scored
// ---------------------------------------------------------------------------

describe("scoreMatch — (d) deferred match self-corrects on re-run", () => {
  it("first call defers; after the missing feeder lands, second call scores", async () => {
    // ---- First attempt: M89 finished, but bracket can't resolve it. ----
    vi.mocked(Match.findOne).mockResolvedValueOnce({
      id: 89, type: "r16", finished: true, homeScore: 1, awayScore: 0,
      homeTeamId: null, awayTeamId: null, winnerTeamId: null,
    } as never);
    vi.mocked(Match.find).mockReturnValueOnce(mockLean([]) as never);
    vi.mocked(Team.find).mockReturnValueOnce(mockLean([]) as never);
    vi.mocked(buildRealBracket).mockReturnValueOnce({
      bracket: [{ matchId: 89, type: "r16" }],
    } as never);

    const firstResult = await scoreMatch(89);
    expect(firstResult.status).toBe("deferred");
    expect(vi.mocked(Score.updateOne)).not.toHaveBeenCalled();

    // ---- Now: missing R32 feeder lands. Re-run on M89. ----
    // (Same M89 finished doc.)
    vi.mocked(Match.findOne).mockResolvedValueOnce({
      id: 89, type: "r16", finished: true, homeScore: 1, awayScore: 0,
      homeTeamId: null, awayTeamId: null, winnerTeamId: null,
    } as never);
    vi.mocked(Match.find).mockReturnValueOnce(mockLean([]) as never);
    vi.mocked(Team.find).mockReturnValueOnce(mockLean([]) as never);
    // Bracket NOW resolves M89: ENG vs FRA.
    vi.mocked(buildRealBracket).mockReturnValueOnce({
      bracket: [{ matchId: 89, type: "r16",
        home: { id: "ENG", name: "England", fifa_code: "ENG" },
        away: { id: "FRA", name: "France",  fifa_code: "FRA" },
      }],
    } as never);
    vi.mocked(Prediction.find).mockResolvedValueOnce([
      { userId: USER_A, matchId: 89, homeScorePred: 1, awayScorePred: 0,
        winnerPickTeamId: "ENG", predHomeTeamId: "ENG", predAwayTeamId: "FRA" },
    ] as never);

    const secondResult = await scoreMatch(89);

    expect(secondResult).toEqual({ status: "scored", matchId: 89, count: 1 });
    expect(vi.mocked(Score.updateOne)).toHaveBeenCalledTimes(1);
    const setArg = vi.mocked(Score.updateOne).mock.calls[0][1] as { $set: { points: number; exact: boolean; advancement: boolean } };
    expect(setArg.$set.points).toBe(14);          // exact 1-0 + ENG advancer
    expect(setArg.$set.exact).toBe(true);
    expect(setArg.$set.advancement).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sanity: throws on unfinished match
// ---------------------------------------------------------------------------

describe("scoreMatch — programmer-error guard", () => {
  it("throws when the match isn't recorded as finished", async () => {
    vi.mocked(Match.findOne).mockResolvedValue({
      id: 5, type: "group", finished: false,
    } as never);
    await expect(scoreMatch(5)).rejects.toThrow(/not finished/);
    expect(vi.mocked(Score.updateOne)).not.toHaveBeenCalled();
  });

  it("throws when the match doesn't exist", async () => {
    vi.mocked(Match.findOne).mockResolvedValue(null as never);
    await expect(scoreMatch(999)).rejects.toThrow(/not finished/);
  });
});
