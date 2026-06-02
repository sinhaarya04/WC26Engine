import { describe, it, expect } from "vitest";
import { validateThirdPlaceOverride } from "./overrideValidation";

// A known-good override for {A,B,C,D,E,F,G,H} — each slot gets an eligible group.
const VALID: Record<string, string> = {
  74: "A",  // M74 eligibility: A/B/C/D/F
  77: "G",  // M77: C/D/F/G/H
  79: "C",  // M79: C/E/F/H/I
  80: "H",  // M80: E/H/I/J/K
  81: "B",  // M81: B/E/F/I/J
  82: "E",  // M82: A/E/H/I/J
  85: "F",  // M85: E/F/G/I/J
  87: "D",  // M87: D/E/I/J/L
};

describe("validateThirdPlaceOverride", () => {
  it("accepts a valid override", () => {
    const r = validateThirdPlaceOverride(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assignments[74]).toBe("A");
      expect(r.assignments[87]).toBe("D");
    }
  });

  it("rejects non-object inputs", () => {
    expect(validateThirdPlaceOverride(null).ok).toBe(false);
    expect(validateThirdPlaceOverride(undefined).ok).toBe(false);
    expect(validateThirdPlaceOverride("string").ok).toBe(false);
    expect(validateThirdPlaceOverride(["A", "B"]).ok).toBe(false);
  });

  it("rejects fewer than 8 assignments", () => {
    const fewer = { ...VALID };
    delete (fewer as Record<string, unknown>)["87"];
    const r = validateThirdPlaceOverride(fewer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/8 assignments/);
  });

  it("rejects more than 8 assignments / unknown match ids", () => {
    const extra = { ...VALID, "99": "A" };
    const r = validateThirdPlaceOverride(extra);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/9|matchId|99/);
  });

  it("rejects a match id outside the third-place set", () => {
    const wrong: Record<string, string> = {
      ...VALID,
      "73": "A",  // M73 is not a third-place slot
    };
    delete wrong["74"];
    const r = validateThirdPlaceOverride(wrong);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/73|matchId/);
  });

  it("rejects an ineligible group for a slot", () => {
    // M74 eligibility is A/B/C/D/F — assign "K" which is invalid for M74.
    const r = validateThirdPlaceOverride({ ...VALID, "74": "K" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Match 74/);
      expect(r.error).toMatch(/not eligible/);
    }
  });

  it("rejects a duplicate group (same letter on two slots)", () => {
    // F is eligible for BOTH M77 (C/D/F/G/H) and M85 (E/F/G/I/J), so this
    // dup passes per-slot eligibility — only the uniqueness check rejects it.
    const dup = { ...VALID, "77": "F" }; // F is already on M85
    const r = validateThirdPlaceOverride(dup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/more than one slot|distinct/);
  });

  it("rejects a non-string group value", () => {
    const r = validateThirdPlaceOverride({ ...VALID, "74": 5 });
    expect(r.ok).toBe(false);
  });

  it("rejects a multi-character group value", () => {
    const r = validateThirdPlaceOverride({ ...VALID, "74": "AA" });
    expect(r.ok).toBe(false);
  });
});
