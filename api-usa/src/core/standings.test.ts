import { describe, it, expect } from "vitest";
import { computeGroupStanding } from "./standings";
import type { GroupMatchResult, TeamRef } from "./types";

const GROUP = "X";

// Helper to build a TeamRef tersely.
const tm = (id: string, seed: number): TeamRef => ({ id, group: GROUP, seed });

// Helper to build a group match result tersely.
const r = (
  home: TeamRef, homeScore: number,
  away: TeamRef, awayScore: number,
): GroupMatchResult => ({ groupId: GROUP, home, homeScore, away, awayScore });

describe("computeGroupStanding", () => {
  it("ranks 4 teams cleanly when there are no ties", () => {
    const A = tm("A", 1);
    const B = tm("B", 2);
    const C = tm("C", 3);
    const D = tm("D", 4);
    const results = [
      r(A, 2, B, 0),  // A 9 pts (3W),  GD +6,  GF 6
      r(C, 1, D, 0),  // C 6 pts (2W1L), GD +1, GF 3
      r(A, 1, C, 0),  // B 3 pts (1W2L), GD -2, GF 3
      r(B, 2, D, 1),  // D 0 pts (3L),   GD -5, GF 1
      r(A, 3, D, 0),
      r(C, 2, B, 1),
    ];

    const standings = computeGroupStanding(GROUP, [A, B, C, D], results);

    expect(standings.map((s) => s.team.id)).toEqual(["A", "C", "B", "D"]);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
    expect(standings.map((s) => s.points)).toEqual([9, 6, 3, 0]);
  });

  it("breaks a 2-way overall tie by goal difference", () => {
    // A: 7 pts, GD +2.  B: 4 pts, GD +4.  C: 4 pts, GD +2.  D: 1 pt.
    // B and C are tied on points; B should rank higher by GD.
    const A = tm("A", 1);
    const B = tm("B", 2);
    const C = tm("C", 3);
    const D = tm("D", 4);
    const results = [
      r(A, 1, B, 1),  // draw
      r(A, 1, C, 0),  // A wins
      r(A, 1, D, 0),  // A wins
      r(B, 7, D, 0),  // B wins big — boosts B's GD
      r(C, 3, B, 0),  // C beats B
      r(C, 0, D, 0),  // draw
    ];

    const standings = computeGroupStanding(GROUP, [A, B, C, D], results);

    expect(standings.map((s) => s.team.id)).toEqual(["A", "B", "C", "D"]);
    expect(standings.map((s) => s.points)).toEqual([7, 4, 4, 1]);
    // Confirm the tiebreaker actually fired on B vs C via GD.
    const [, bRow, cRow] = standings;
    expect(bRow.goalDiff).toBeGreaterThan(cRow.goalDiff);
  });

  it("breaks a 3-way overall tie via head-to-head goal difference", () => {
    // A, B, C all 6 pts / +2 GD / 5 GF overall. D last.
    // H2H cycle: A beats B 2-0, B beats C 1-0, C beats A 1-0.
    // All have 3 H2H pts → break by H2H GD: A +1, C 0, B -1.
    const A = tm("A", 1);
    const B = tm("B", 2);
    const C = tm("C", 3);
    const D = tm("D", 4);
    const results = [
      // H2H cycle
      r(A, 2, B, 0),
      r(B, 1, C, 0),
      r(C, 1, A, 0),
      // Asymmetric beat-D scores chosen so all three have identical overall stats:
      r(A, 3, D, 2),
      r(B, 4, D, 1),
      r(C, 4, D, 2),
    ];

    const standings = computeGroupStanding(GROUP, [A, B, C, D], results);

    expect(standings.map((s) => s.team.id)).toEqual(["A", "C", "B", "D"]);
    // Sanity-check: A, B, C have identical overall stats (so overall didn't break it).
    expect(standings[0].points).toBe(6);
    expect(standings[1].points).toBe(6);
    expect(standings[2].points).toBe(6);
    expect(standings[0].goalDiff).toBe(standings[1].goalDiff);
    expect(standings[1].goalDiff).toBe(standings[2].goalDiff);
    expect(standings[0].goalsFor).toBe(standings[1].goalsFor);
    expect(standings[1].goalsFor).toBe(standings[2].goalsFor);
  });

  it("falls through to FIFA seed order when overall and H2H are fully tied", () => {
    // All six matches end 1-1 → every team: 3 pts, 0 GD, 3 GF / 3 GA.
    // H2H mini-table is the same matches, so still fully tied. Fair-play stub
    // gives nothing. Final fallback: seed order, lowest seed wins.
    const A = tm("A", 10);
    const B = tm("B", 5);
    const C = tm("C", 20);
    const D = tm("D", 1);
    const results = [
      r(A, 1, B, 1),
      r(A, 1, C, 1),
      r(A, 1, D, 1),
      r(B, 1, C, 1),
      r(B, 1, D, 1),
      r(C, 1, D, 1),
    ];

    const standings = computeGroupStanding(GROUP, [A, B, C, D], results);

    // Order by seed: D(1), B(5), A(10), C(20).
    expect(standings.map((s) => s.team.id)).toEqual(["D", "B", "A", "C"]);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
    // Confirm everyone has identical underlying stats.
    expect(standings.every((s) => s.points === 3)).toBe(true);
    expect(standings.every((s) => s.goalDiff === 0)).toBe(true);
    expect(standings.every((s) => s.goalsFor === 3)).toBe(true);
  });

  it("is deterministic — identical inputs produce identical outputs", () => {
    const A = tm("A", 10);
    const B = tm("B", 5);
    const C = tm("C", 20);
    const D = tm("D", 1);
    const results = [
      r(A, 1, B, 1), r(A, 1, C, 1), r(A, 1, D, 1),
      r(B, 1, C, 1), r(B, 1, D, 1), r(C, 1, D, 1),
    ];
    const first  = computeGroupStanding(GROUP, [A, B, C, D], results);
    // Shuffle the team input order — output ranking must not depend on it.
    const second = computeGroupStanding(GROUP, [C, A, D, B], results);
    expect(second.map((s) => s.team.id)).toEqual(first.map((s) => s.team.id));
  });

  it("filters results by groupId — ignores other groups' matches", () => {
    const A = tm("A", 1);
    const B = tm("B", 2);
    const C = tm("C", 3);
    const D = tm("D", 4);
    const inGroup = [
      r(A, 2, B, 0),
      r(A, 1, C, 0),
      r(A, 1, D, 0),
      r(B, 2, C, 0),
      r(B, 1, D, 0),
      r(C, 1, D, 0),
    ];
    const stranger = tm("Z", 99);
    const noise: GroupMatchResult = {
      groupId: "OTHER", home: A, away: stranger, homeScore: 5, awayScore: 0,
    };

    const standings = computeGroupStanding(GROUP, [A, B, C, D], [...inGroup, noise]);
    expect(standings.map((s) => s.team.id)).toEqual(["A", "B", "C", "D"]);
    expect(standings[0].played).toBe(3); // 3 group matches, not 4
  });
});
