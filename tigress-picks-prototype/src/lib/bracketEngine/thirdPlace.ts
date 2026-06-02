/**
 * Cross-group third-place ranking.
 * Vendored from api-usa/src/core/thirdPlace.ts — keep in sync.
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
    return a.team.group.localeCompare(b.team.group);
  });
  return ranked.slice(0, 8);
}
