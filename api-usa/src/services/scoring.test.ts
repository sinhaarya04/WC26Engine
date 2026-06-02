/**
 * Tests for the cumulative stacking scorer (matchup-gated for knockouts).
 *
 * Components stack:
 *   exact (+5) ⊆ gd (+4) ⊆ outcome (+3)        — score-pattern components
 *   knockout: advancement (+2)                  — independent of components
 *
 * Knockout SCORE components fire ONLY when the user's predicted
 * (predHomeTeamId, predAwayTeamId) pair matches the actual
 * (homeTeamId, awayTeamId) pair on the same sides. Side-swap does NOT
 * count.
 *
 * Lock of the Day has been REMOVED — the up-front bracket flow has a
 * single tournament-wide deadline and no per-day double-pick.
 */

import { describe, it, expect } from "vitest";
import { scorePrediction, type ScoreBreakdown } from "./scoring";

// ---------- helpers ----------

function group(
  predHome: number,
  predAway: number,
  actHome: number,
  actAway: number,
): ScoreBreakdown {
  return scorePrediction({
    pred:   { home: predHome, away: predAway },
    actual: { home: actHome,  away: actAway  },
    isKnockout: false,
  });
}

function ko(
  predHome: number,
  predAway: number,
  predPick: string | null,
  actHome: number,
  actAway: number,
  advancing: string | null,
  predHomeTeamId: string | null = "TEAM_HOME",
  predAwayTeamId: string | null = "TEAM_AWAY",
  actualHomeTeamId: string | null = "TEAM_HOME",
  actualAwayTeamId: string | null = "TEAM_AWAY",
): ScoreBreakdown {
  return scorePrediction({
    pred:   {
      home: predHome, away: predAway,
      winnerPickTeamId: predPick,
      predHomeTeamId, predAwayTeamId,
    },
    actual: {
      home: actHome, away: actAway,
      advancingTeamId: advancing,
      homeTeamId: actualHomeTeamId, awayTeamId: actualAwayTeamId,
    },
    isKnockout: true,
  });
}

// ---------- Group: stacking components (unchanged) ----------

describe("scorePrediction — group: stacking components", () => {
  it("exact match yields 12 (5+4+3)", () => {
    expect(group(2, 1, 2, 1)).toEqual({
      exact: true, gd: true, outcome: true, advancement: false, points: 12,
    });
  });

  it("exact 0-0 draw yields 12", () => {
    expect(group(0, 0, 0, 0)).toEqual({
      exact: true, gd: true, outcome: true, advancement: false, points: 12,
    });
  });

  it("right outcome + GD, wrong exact (2-1 vs 3-2) yields 7", () => {
    expect(group(2, 1, 3, 2)).toEqual({
      exact: false, gd: true, outcome: true, advancement: false, points: 7,
    });
  });

  it("right outcome only (1-0 vs 2-0) yields 3", () => {
    expect(group(1, 0, 2, 0)).toEqual({
      exact: false, gd: false, outcome: true, advancement: false, points: 3,
    });
  });

  it("wrong outcome yields 0", () => {
    expect(group(1, 0, 0, 2)).toEqual({
      exact: false, gd: false, outcome: false, advancement: false, points: 0,
    });
  });

  it("null prediction yields 0", () => {
    const out = scorePrediction({
      pred: null,
      actual: { home: 2, away: 1 },
      isKnockout: false,
    });
    expect(out.points).toBe(0);
  });
});

// ---------- Knockout: matchup-gated components + advancement bonus ----------

describe("scorePrediction — knockout: matchup-gated components", () => {
  it("matchup matches + exact + correct advancer → 14 (5+4+3+2)", () => {
    expect(ko(2, 1, "TEAM_HOME", 2, 1, "TEAM_HOME")).toEqual({
      exact: true, gd: true, outcome: true, advancement: true, points: 14,
    });
  });

  it("matchup matches, 90-min draw, exact, correct advancer (penalties) → 14", () => {
    expect(ko(1, 1, "TEAM_AWAY", 1, 1, "TEAM_AWAY")).toEqual({
      exact: true, gd: true, outcome: true, advancement: true, points: 14,
    });
  });

  it("matchup matches, right outcome+GD, wrong exact, right advancer → 9 (4+3+2)", () => {
    expect(ko(2, 1, "TEAM_HOME", 3, 2, "TEAM_HOME")).toEqual({
      exact: false, gd: true, outcome: true, advancement: true, points: 9,
    });
  });

  it("matchup DOES NOT match: score components are zero even on exact-score guess", () => {
    // User predicted FRA/ENG 2-1; real M73 was BRA/ARG 2-1.
    expect(
      ko(2, 1, "FRA", 2, 1, "BRA",
         /* predHome */ "FRA", /* predAway */ "ENG",
         /* actHome */  "BRA", /* actAway */  "ARG"),
    ).toEqual({
      exact: false, gd: false, outcome: false, advancement: false, points: 0,
    });
  });

  it("matchup DOES NOT match but pick equals actual advancer → +2 only", () => {
    // Predicted FRA wins; real match advances FRA from a different fixture.
    expect(
      ko(2, 1, "FRA", 3, 0, "FRA",
         "FRA", "ENG",  // user's predicted matchup
         "ITA", "GER"), // real matchup
    ).toEqual({
      exact: false, gd: false, outcome: false, advancement: true, points: 2,
    });
  });

  it("side-swap matchup does NOT count (FRA-vs-ENG vs ENG-vs-FRA → 0 components)", () => {
    expect(
      ko(2, 1, "FRA", 1, 2, "FRA",
         "FRA", "ENG",
         "ENG", "FRA"),
    ).toEqual({
      exact: false, gd: false, outcome: false, advancement: true, points: 2,
    });
  });

  it("missing predHomeTeamId/predAwayTeamId → components gated off", () => {
    expect(
      ko(2, 1, "TEAM_HOME", 2, 1, "TEAM_HOME",
         null, null,             // user side ids missing
         "TEAM_HOME", "TEAM_AWAY"),
    ).toEqual({
      exact: false, gd: false, outcome: false, advancement: true, points: 2,
    });
  });

  it("missing actual home/away team ids → components gated off", () => {
    expect(
      ko(2, 1, "TEAM_HOME", 2, 1, "TEAM_HOME",
         "TEAM_HOME", "TEAM_AWAY",
         null, null),              // real-match side ids missing
    ).toEqual({
      exact: false, gd: false, outcome: false, advancement: true, points: 2,
    });
  });

  it("matchup matches, wrong scoreline entirely but correct advancer → +2", () => {
    expect(ko(0, 3, "TEAM_HOME", 4, 1, "TEAM_HOME")).toEqual({
      exact: false, gd: false, outcome: false, advancement: true, points: 2,
    });
  });

  it("matchup matches, scoreline correct, wrong advancer pick → 12 (no bonus)", () => {
    expect(ko(3, 2, "TEAM_AWAY", 3, 2, "TEAM_HOME")).toEqual({
      exact: true, gd: true, outcome: true, advancement: false, points: 12,
    });
  });

  it("missing winnerPickTeamId → no advancement bonus", () => {
    expect(ko(2, 1, null, 2, 1, "TEAM_HOME")).toEqual({
      exact: true, gd: true, outcome: true, advancement: false, points: 12,
    });
  });

  it("missing advancingTeamId → no bonus", () => {
    expect(ko(1, 1, "TEAM_HOME", 1, 1, null)).toEqual({
      exact: true, gd: true, outcome: true, advancement: false, points: 12,
    });
  });

  it("empty-string winnerPick or advancing id treated as missing", () => {
    expect(ko(2, 1, "", 2, 1, "TEAM_HOME").advancement).toBe(false);
    expect(ko(2, 1, "TEAM_HOME", 2, 1, "").advancement).toBe(false);
  });
});

// ---------- isKnockout=false ignores advancement context ----------

describe("scorePrediction — isKnockout=false ignores advancement context", () => {
  it("group flag false: a matching winnerPick + advancingTeamId yields NO bonus", () => {
    const out = scorePrediction({
      pred:   { home: 2, away: 1, winnerPickTeamId: "TEAM_A" },
      actual: { home: 2, away: 1, advancingTeamId:  "TEAM_A" },
      isKnockout: false,
    });
    expect(out.advancement).toBe(false);
    expect(out.points).toBe(12);
  });
});

// ---------- Invariants ----------

describe("scorePrediction — invariants", () => {
  it("group: any exact score forces gd=true and outcome=true", () => {
    for (const [h, a] of [[0, 0], [1, 0], [0, 2], [3, 3], [4, 2]] as const) {
      const out = group(h, a, h, a);
      expect(out.exact, `${h}-${a}`).toBe(true);
      expect(out.gd).toBe(true);
      expect(out.outcome).toBe(true);
    }
  });

  it("knockout: maxima are 14 (perfect) and 0 (full miss)", () => {
    expect(ko(2, 1, "TEAM_HOME", 2, 1, "TEAM_HOME").points).toBe(14);
    expect(ko(0, 5, "TEAM_AWAY", 3, 0, "TEAM_HOME").points).toBe(0);
  });
});
