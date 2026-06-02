/**
 * FIFA 2026 third-place allocation table.
 * Vendored from api-usa/src/core/thirdPlaceTable.ts — keep in sync.
 * See the upstream file for the verification disclaimer.
 */

export type GroupLetter =
  | "A" | "B" | "C" | "D" | "E" | "F"
  | "G" | "H" | "I" | "J" | "K" | "L";

export type ThirdPlaceMatchId = 74 | 77 | 79 | 80 | 81 | 82 | 85 | 87;

export const THIRD_PLACE_SLOTS: ReadonlyArray<ThirdPlaceMatchId> =
  [74, 77, 79, 80, 81, 82, 85, 87];

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

export type ThirdPlaceAssignment = Readonly<Record<ThirdPlaceMatchId, GroupLetter>>;

export function resolveThirdPlaceAssignment(
  groups: ReadonlyArray<GroupLetter>,
): ThirdPlaceAssignment {
  if (groups.length !== 8) {
    throw new Error(`Expected exactly 8 qualifying groups, got ${groups.length}.`);
  }
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
      `No valid third-place slotting for combination "${sorted.join("")}".`,
    );
  }
  return assignment as ThirdPlaceAssignment;
}
