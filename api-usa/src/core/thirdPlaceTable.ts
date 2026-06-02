/**
 * ============================================================================
 * FIFA 2026 THIRD-PLACE ALLOCATION TABLE
 *
 *   ⚠️  CRITICAL  ⚠️
 *
 * This module decides which group's third-placed team fills each of the eight
 * R32 slots that take a third-place qualifier (matches 74, 77, 79, 80, 81,
 * 82, 85, 87). It is the SINGLE MOST ERROR-PRONE ARTIFACT in this system. A
 * wrong slot here means the R32 bracket fills incorrectly, the cascade up
 * to the Final inherits the error, and EVERY knockout-stage prediction
 * scores against the wrong matchups.
 *
 * The eligibility sets below ARE verified — they are taken directly from the
 * R32 slot labels used in the published bracket:
 *
 *   M74 → 3rd of A/B/C/D/F
 *   M77 → 3rd of C/D/F/G/H
 *   M79 → 3rd of C/E/F/H/I
 *   M80 → 3rd of E/H/I/J/K
 *   M81 → 3rd of B/E/F/I/J
 *   M82 → 3rd of A/E/H/I/J
 *   M85 → 3rd of E/F/G/I/J
 *   M87 → 3rd of D/E/I/J/L
 *
 * What is NOT yet verified is the *specific* group→slot mapping FIFA
 * publishes for each of the 495 combinations of 8-of-12 advancing thirds.
 * Until that table is hand-encoded from FIFA's official source, this module
 * resolves each combination DETERMINISTICALLY via backtracking: at each
 * slot (walked in fixed order 74→77→79→80→81→82→85→87) it picks the
 * lexicographically smallest unused eligible group such that a valid
 * completion exists. The output is stable for every input combination.
 *
 * BEFORE PRODUCTION USE: replace `resolveThirdPlaceAssignment` with an
 * explicit pre-computed table that has been verified line-by-line against
 * FIFA's official publication. The current implementation is correct in
 * *structure* (every combination produces a perfect matching with no
 * eligibility violation), but the per-slot assignment is our determinism,
 * not FIFA's.
 * ============================================================================
 */

export type GroupLetter =
  | "A" | "B" | "C" | "D" | "E" | "F"
  | "G" | "H" | "I" | "J" | "K" | "L";

export type ThirdPlaceMatchId = 74 | 77 | 79 | 80 | 81 | 82 | 85 | 87;

/** Eight R32 slots that take a third-placed team, in canonical order. */
export const THIRD_PLACE_SLOTS: ReadonlyArray<ThirdPlaceMatchId> =
  [74, 77, 79, 80, 81, 82, 85, 87];

/**
 * Eligibility set per slot: the group letters whose third-placed team is
 * allowed to fill this slot. These come from FIFA's published bracket and
 * are the verified portion of this module.
 */
export const SLOT_ELIGIBILITY: Readonly<Record<ThirdPlaceMatchId, ReadonlyArray<GroupLetter>>> = {
  74: ["A", "B", "C", "D", "F"],
  77: ["C", "D", "F", "G", "H"],
  79: ["C", "E", "F", "H", "I"],
  80: ["E", "H", "I", "J", "K"],
  81: ["B", "E", "F", "I", "J"],
  82: ["A", "E", "H", "I", "J"],
  85: ["E", "F", "G", "I", "J"],
  87: ["D", "E", "I", "J", "L"],
};

/** Result: each of the 8 slots → the group letter whose 3rd fills it. */
export type ThirdPlaceAssignment = Readonly<Record<ThirdPlaceMatchId, GroupLetter>>;

/** Canonical key for the lookup table: sorted concatenation of the 8 letters. */
export function thirdPlaceKey(groups: ReadonlyArray<GroupLetter>): string {
  return [...groups].sort().join("");
}

/**
 * Deterministically slot each of the eight advancing third-placed groups into
 * one of the eight R32 third-place slots. Throws if `groups.length !== 8` or
 * if no valid slotting exists (which the test suite verifies is impossible
 * for every valid 8-of-12 combination).
 */
export function resolveThirdPlaceAssignment(
  groups: ReadonlyArray<GroupLetter>,
): ThirdPlaceAssignment {
  if (groups.length !== 8) {
    throw new Error(`Expected exactly 8 qualifying groups, got ${groups.length}.`);
  }
  // Sort the input so the algorithm's tie-breaking choice is stable.
  const sorted = [...groups].sort() as GroupLetter[];

  const assignment: Partial<Record<ThirdPlaceMatchId, GroupLetter>> = {};
  const used = new Set<GroupLetter>();

  const fillFrom = (slotIdx: number): boolean => {
    if (slotIdx === THIRD_PLACE_SLOTS.length) return true;
    const slot = THIRD_PLACE_SLOTS[slotIdx];
    const eligible = SLOT_ELIGIBILITY[slot];
    for (const g of sorted) {
      if (used.has(g)) continue;
      if (!eligible.includes(g)) continue;
      assignment[slot] = g;
      used.add(g);
      if (fillFrom(slotIdx + 1)) return true;
      delete assignment[slot];
      used.delete(g);
    }
    return false;
  };

  if (!fillFrom(0)) {
    throw new Error(
      `No valid third-place slotting for combination "${sorted.join("")}". ` +
        `This indicates either a bug in the eligibility sets or an impossible input.`,
    );
  }
  return assignment as ThirdPlaceAssignment;
}
