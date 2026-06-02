/**
 * Validation for the third-place R32 admin override. Pure — no DB / I/O.
 *
 * Rejects:
 *   • match ids that aren't exactly the eight third-place slots
 *   • assigned group not in the slot's verified SLOT_ELIGIBILITY set
 *   • the same group letter assigned to more than one slot
 *   • fewer or more than 8 distinct group letters total
 */

import {
  SLOT_ELIGIBILITY,
  THIRD_PLACE_SLOTS,
  type GroupLetter,
  type ThirdPlaceMatchId,
} from "../core/thirdPlaceTable";

export type Assignments = Readonly<Record<ThirdPlaceMatchId, GroupLetter>>;

export type ValidationResult =
  | { ok: true; assignments: Assignments }
  | { ok: false; error: string };

export function validateThirdPlaceOverride(input: unknown): ValidationResult {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "assignments must be a JSON object keyed by matchId" };
  }
  const raw = input as Record<string, unknown>;

  // 1. Exactly the eight third-place match ids — no extras, no missing.
  const expectedKeys = THIRD_PLACE_SLOTS.map(String).sort();
  const gotKeys = Object.keys(raw).sort();

  if (gotKeys.length !== expectedKeys.length) {
    return {
      ok: false,
      error: `Expected exactly ${expectedKeys.length} assignments (matchIds ${expectedKeys.join(", ")}); got ${gotKeys.length}`,
    };
  }
  for (let i = 0; i < expectedKeys.length; i++) {
    if (gotKeys[i] !== expectedKeys[i]) {
      return {
        ok: false,
        error: `Unexpected matchId "${gotKeys[i]}". Allowed matchIds: ${expectedKeys.join(", ")}`,
      };
    }
  }

  // 2. Per-slot eligibility.
  const assignments = {} as Record<ThirdPlaceMatchId, GroupLetter>;
  for (const slot of THIRD_PLACE_SLOTS) {
    const value = raw[String(slot)];
    if (typeof value !== "string" || value.length !== 1) {
      return { ok: false, error: `Match ${slot}: group letter must be a single uppercase letter` };
    }
    const eligible = SLOT_ELIGIBILITY[slot];
    if (!eligible.includes(value as GroupLetter)) {
      return {
        ok: false,
        error: `Match ${slot}: group "${value}" is not eligible. Allowed: ${eligible.join(", ")}`,
      };
    }
    assignments[slot] = value as GroupLetter;
  }

  // 3. No duplicate groups → also enforces "exactly 8 distinct" (we have 8 keys
  //    already from check 1, so |unique values| === 8 is the dup check).
  const seen = new Set<GroupLetter>();
  for (const slot of THIRD_PLACE_SLOTS) {
    const g = assignments[slot];
    if (seen.has(g)) {
      return { ok: false, error: `Group "${g}" assigned to more than one slot` };
    }
    seen.add(g);
  }
  if (seen.size !== 8) {
    return { ok: false, error: `Expected 8 distinct groups, got ${seen.size}` };
  }

  return { ok: true, assignments };
}
