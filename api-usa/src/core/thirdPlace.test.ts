import { describe, it, expect } from "vitest";
import { rankThirdPlaces } from "./thirdPlace";
import {
  resolveThirdPlaceAssignment,
  SLOT_ELIGIBILITY,
  THIRD_PLACE_SLOTS,
  type GroupLetter,
} from "./thirdPlaceTable";
import type { RankedTeam } from "./types";

const ALL_GROUPS: GroupLetter[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
];

/** Yield every k-of-arr combination. Used to enumerate all 495 cases. */
function* combinations<T>(
  arr: ReadonlyArray<T>,
  k: number,
  start = 0,
): Generator<T[]> {
  if (k === 0) { yield []; return; }
  for (let i = start; i <= arr.length - k; i++) {
    for (const rest of combinations(arr, k - 1, i + 1)) {
      yield [arr[i], ...rest];
    }
  }
}

/** Build a fake RankedTeam row for a group's third-placed team. */
function third(
  group: GroupLetter,
  seed: number,
  pts: number,
  gd: number,
  gf: number,
): RankedTeam {
  return {
    rank: 3,
    team: { id: `${group}-3`, group, seed },
    played: 3,
    won: 0, drawn: 0, lost: 0,
    goalsFor: gf, goalsAgainst: gf - gd,
    goalDiff: gd, points: pts,
  };
}

/** Build a 4-row standings array; only the rank-3 row matters here. */
function groupStanding(thirdRow: RankedTeam): RankedTeam[] {
  const pad = (r: 1 | 2 | 4): RankedTeam => ({
    rank: r,
    team: { id: `${thirdRow.team.group}-r${r}`, group: thirdRow.team.group, seed: r },
    played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
  });
  return [pad(1), pad(2), thirdRow, pad(4)];
}

// ---------- (c) Same-pot cross-group tie via group letter ----------

describe("rankThirdPlaces", () => {
  it("resolves a same-pot cross-group tie via group letter (step 5)", () => {
    // Groups A and B both have third-placed teams with identical pts/GD/GF
    // AND the same seed (both pot 4). Only group letter can untie them.
    // Other 10 groups have strictly worse stats so they don't interfere.
    const allStandings: RankedTeam[][] = ALL_GROUPS.map((g) => {
      if (g === "A" || g === "B") {
        return groupStanding(third(g, /* same seed */ 4, 4, +1, 3));
      }
      return groupStanding(third(g, 4, 1, -2, 1));
    });

    const ranked = rankThirdPlaces(allStandings);

    expect(ranked.length).toBe(8);
    // A and B must occupy slots 0 and 1 (best two thirds), in that order.
    expect(ranked[0].team.group).toBe("A");
    expect(ranked[1].team.group).toBe("B");
    // Sanity-check they were genuinely tied on every field above seed.
    expect(ranked[0].points).toBe(ranked[1].points);
    expect(ranked[0].goalDiff).toBe(ranked[1].goalDiff);
    expect(ranked[0].goalsFor).toBe(ranked[1].goalsFor);
    expect(ranked[0].team.seed).toBe(ranked[1].team.seed);
  });

  it("returns exactly the best 8 thirds", () => {
    // 12 thirds with distinct point totals 12,11,10,...,1 — best 8 are the
    // top 8. The bottom 4 must NOT appear in the result.
    const allStandings: RankedTeam[][] = ALL_GROUPS.map((g, idx) =>
      groupStanding(third(g, 4, 12 - idx, 0, 2)),
    );

    const ranked = rankThirdPlaces(allStandings);

    expect(ranked.length).toBe(8);
    expect(ranked.map((r) => r.team.group)).toEqual(
      ALL_GROUPS.slice(0, 8), // best 8 by descending points = A..H
    );
    expect(ranked.map((r) => r.points)).toEqual([12, 11, 10, 9, 8, 7, 6, 5]);
  });

  it("respects the full cascade — points > GD > GF > seed > letter", () => {
    // Construct one collision at each level of the cascade.
    //   Highest pts: top group wins outright.
    //   Tied pts but better GD: better GD wins.
    //   Tied pts+GD but better GF: better GF wins.
    //   Tied pts+GD+GF but lower seed: lower seed wins.
    //   Tied all four: alphabetical group letter wins.
    const allStandings: RankedTeam[][] = ALL_GROUPS.map((g) => {
      switch (g) {
        case "A": return groupStanding(third("A", 1, 9, +5, 8));  // wins on points
        case "B": return groupStanding(third("B", 4, 6, +3, 5));  // tied with C on pts
        case "C": return groupStanding(third("C", 1, 6, +2, 5));  // tied with B on pts, loses GD
        case "D": return groupStanding(third("D", 4, 4, 0, 4));   // tied with E on pts+GD
        case "E": return groupStanding(third("E", 1, 4, 0, 3));   // tied with D, loses GF
        case "F": return groupStanding(third("F", 1, 3, 0, 2));   // tied with G on pts+GD+GF; lower seed wins
        case "G": return groupStanding(third("G", 4, 3, 0, 2));
        case "H": return groupStanding(third("H", 4, 2, 0, 1));   // tied with I on all four; H < I alphabetically
        case "I": return groupStanding(third("I", 4, 2, 0, 1));
        default:  return groupStanding(third(g, 4, 1, -1, 0));    // J, K, L worst
      }
    });

    const ranked = rankThirdPlaces(allStandings);
    expect(ranked.map((r) => r.team.group)).toEqual(
      ["A", "B", "C", "D", "E", "F", "G", "H"],
    );
  });
});

// ---------- (a) Sample 8-group combination ----------

describe("resolveThirdPlaceAssignment — sample", () => {
  it("returns a valid complete slotting for {A,B,C,D,E,F,G,H}", () => {
    const combo: GroupLetter[] = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const assignment = resolveThirdPlaceAssignment(combo);

    // All 8 slots filled.
    expect(Object.keys(assignment).length).toBe(8);
    // Each slot's assigned group is eligible for that slot.
    for (const slot of THIRD_PLACE_SLOTS) {
      const g = assignment[slot];
      expect(g).toBeDefined();
      expect(SLOT_ELIGIBILITY[slot]).toContain(g);
    }
    // The 8 assigned groups are exactly the input combination, each used once.
    const assigned = Object.values(assignment).sort();
    expect(assigned).toEqual([...combo].sort());
  });

  it("is deterministic — identical inputs produce identical assignments", () => {
    const combo: GroupLetter[] = ["E", "G", "I", "K", "L", "B", "D", "F"];
    const a = resolveThirdPlaceAssignment(combo);
    const b = resolveThirdPlaceAssignment([...combo].reverse() as GroupLetter[]);
    expect(a).toEqual(b);
  });

  it("throws on the wrong number of groups", () => {
    expect(() => resolveThirdPlaceAssignment(["A", "B", "C"] as GroupLetter[])).toThrow();
    expect(() => resolveThirdPlaceAssignment(ALL_GROUPS)).toThrow();
  });
});

// ---------- (b) All C(12,8) = 495 combinations ----------

describe("resolveThirdPlaceAssignment — exhaustive over all 495 combinations", () => {
  it("every combination produces a valid complete slotting", () => {
    const combos = [...combinations(ALL_GROUPS, 8)];
    expect(combos.length).toBe(495); // sanity: C(12,8) = 495

    for (const combo of combos) {
      const assignment = resolveThirdPlaceAssignment(combo);

      // (1) Eight slots filled — no orphans.
      for (const slot of THIRD_PLACE_SLOTS) {
        const g = assignment[slot] as GroupLetter | undefined;
        expect(g, `slot ${slot} unfilled for combo ${combo.join("")}`).toBeDefined();
      }

      // (2) Every assigned group is eligible for its slot.
      for (const slot of THIRD_PLACE_SLOTS) {
        const g = assignment[slot] as GroupLetter;
        expect(
          SLOT_ELIGIBILITY[slot].includes(g),
          `group ${g} assigned to slot ${slot}, which is only eligible for ${SLOT_ELIGIBILITY[slot].join(",")} ` +
            `(combo ${combo.join("")})`,
        ).toBe(true);
      }

      // (3) Each group used exactly once; assigned set equals input combo.
      const used = THIRD_PLACE_SLOTS.map((s) => assignment[s] as GroupLetter);
      const usedSet = new Set(used);
      expect(usedSet.size, `duplicate assignment in combo ${combo.join("")}`).toBe(8);
      expect([...usedSet].sort()).toEqual([...combo].sort());
    }
  });
});
