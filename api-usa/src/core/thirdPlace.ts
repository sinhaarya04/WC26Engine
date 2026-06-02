/**
 * Cross-group third-place ranking.
 *
 * The 12 third-placed teams (one per group) are ranked against each other to
 * decide which 8 advance to R32. Tiebreaker cascade, in exact order:
 *
 *   1. Points
 *   2. Goal difference
 *   3. Goals scored
 *   4. Seed (lower pot wins)
 *   5. Group letter alphabetically (A before B…)
 *      ← DETERMINISTIC TIEBREAKER OF LAST RESORT.
 *        Within a single group seeds are unique (one team per pot), so the
 *        group-stage cascade in standings.ts never needs this. Cross-group,
 *        two third-placed teams CAN share a pot (e.g. both pot 4), so seed
 *        alone can tie. Group letter is the unbreakable final key.
 *
 * Pure function — no DB, no I/O, no side effects.
 */

import type { RankedTeam } from "./types";

export function rankThirdPlaces(
  allStandings: ReadonlyArray<ReadonlyArray<RankedTeam>>,
): RankedTeam[] {
  if (allStandings.length !== 12) {
    throw new Error(
      `rankThirdPlaces: expected standings for 12 groups, got ${allStandings.length}.`,
    );
  }

  const thirds: RankedTeam[] = [];
  for (const groupStandings of allStandings) {
    const third = groupStandings.find((r) => r.rank === 3);
    if (!third) {
      throw new Error(
        "rankThirdPlaces: every group must have a team ranked 3rd; one was missing.",
      );
    }
    thirds.push(third);
  }

  const ranked = [...thirds].sort((a, b) => {
    if (b.points !== a.points)     return b.points     - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff   - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor   - a.goalsFor;
    if (a.team.seed !== b.team.seed) return a.team.seed - b.team.seed;
    // Step 5 — deterministic final tiebreaker. Group letter is the only field
    // guaranteed unique across the 12 third-placed teams.
    return a.team.group.localeCompare(b.team.group);
  });

  return ranked.slice(0, 8);
}
