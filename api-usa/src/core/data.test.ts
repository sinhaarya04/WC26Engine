/**
 * Data-integrity tests for the canonical teams file at FIFAPREDICTIONS/teams.json.
 *
 * The core resolver operates on synthetic TeamRef inputs, which means nothing
 * else in the suite would notice if the teams data got corrupted (wrong pot,
 * wrong group, missing team, swapped seeds…). This file guards the data itself.
 *
 * Reads directly from `../teams.json` (one level above the api-usa project)
 * so the test and the seed loader both depend on the same source of truth.
 */

import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

const TEAMS_PATH = path.resolve(process.cwd(), "..", "teams.json");

interface TeamRecord {
  id: number;
  name: string;
  fifa_code: string;
  group: string;
  group_position: number;
  pot: number;
  /** Unique FIFA world-ranking position among the 48 qualifiers (1–48). */
  seed: number;
  /** Same value as `seed`; retained as a labelled alias for clarity. */
  fifa_rank_seed: number;
}

const teams = JSON.parse(fs.readFileSync(TEAMS_PATH, "utf8")) as TeamRecord[];

const ALL_GROUP_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

describe("FIFAPREDICTIONS/teams.json integrity", () => {
  it("contains exactly 48 teams", () => {
    expect(teams.length).toBe(48);
  });

  it("has exactly 12 teams per pot (1, 2, 3, 4)", () => {
    const byPot: Record<number, number> = {};
    for (const t of teams) byPot[t.pot] = (byPot[t.pot] || 0) + 1;
    expect(byPot).toEqual({ 1: 12, 2: 12, 3: 12, 4: 12 });
  });

  it("has all 12 groups (A–L), 4 teams each, one team per pot in every group", () => {
    const byGroup = new Map<string, TeamRecord[]>();
    for (const t of teams) {
      const arr = byGroup.get(t.group) ?? [];
      arr.push(t);
      byGroup.set(t.group, arr);
    }
    expect([...byGroup.keys()].sort()).toEqual(ALL_GROUP_LETTERS);
    for (const g of ALL_GROUP_LETTERS) {
      const rows = byGroup.get(g)!;
      expect(rows.length, `Group ${g} should have 4 teams`).toBe(4);
      const pots = rows.map((r) => r.pot).sort();
      expect(pots, `Group ${g} should have one team per pot`).toEqual([1, 2, 3, 4]);
    }
  });

  it("has 48 unique seed values, each in range 1–48", () => {
    const seeds = teams.map((t) => t.seed);
    expect(new Set(seeds).size, "seeds must be unique").toBe(48);
    expect(Math.min(...seeds)).toBe(1);
    expect(Math.max(...seeds)).toBe(48);
    // Belt-and-suspenders: the multiset is exactly {1..48}.
    expect([...seeds].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 48 }, (_, i) => i + 1),
    );
  });

  it("has fifa_rank_seed equal to seed for every team", () => {
    for (const t of teams) {
      expect(
        t.fifa_rank_seed,
        `${t.name} (id ${t.id}): fifa_rank_seed (${t.fifa_rank_seed}) ≠ seed (${t.seed})`,
      ).toBe(t.seed);
    }
  });

  it("has unique ids 1–48 (no gaps, no duplicates)", () => {
    const ids = teams.map((t) => t.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 48 }, (_, i) => i + 1));
  });

  it("has unique fifa_code values", () => {
    const codes = new Set(teams.map((t) => t.fifa_code));
    expect(codes.size).toBe(48);
  });

  it("spot-checks: verified FIFA-ranking seeds", () => {
    const find = (name: string): TeamRecord | undefined =>
      teams.find((t) => t.name === name);

    expect(find("France")?.seed).toBe(1);
    expect(find("Spain")?.seed).toBe(2);
    expect(find("Argentina")?.seed).toBe(3);
    expect(find("England")?.seed).toBe(4);
    expect(find("Ghana")?.seed).toBe(48);
  });

  it("spot-checks: FIFA-correct team names are preserved", () => {
    const names = new Set(teams.map((t) => t.name));
    expect(names.has("Czechia")).toBe(true);
    expect(names.has("Türkiye")).toBe(true);
    expect(names.has("DR Congo")).toBe(true);
    expect(names.has("USA")).toBe(true);
    // The old forms must NOT be present.
    expect(names.has("Czech Republic")).toBe(false);
    expect(names.has("Turkey")).toBe(false);
    expect(names.has("Democratic Republic of the Congo")).toBe(false);
    expect(names.has("United States")).toBe(false);
  });
});
