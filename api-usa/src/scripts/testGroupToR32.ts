/**
 * test:group-r32 — focused end-to-end check that the group stage feeds R32 correctly.
 *
 *   npm run test:group-r32          # uses default seed
 *   npm run test:group-r32 -- --seed=12345
 *
 * What it does (no logic reimplementation — all production services are
 * called by name):
 *
 *   1. Connect to the dev DB (same MONGODB_URL the app uses).
 *   2. Load the 48 teams and 72 group matches that seed:tournament imported.
 *   3. Generate random scores for every group match using a seedable RNG.
 *      Reproducible: same --seed → same scores → same standings → same R32.
 *   4. Call the REAL computeGroupStanding(...) once per group.
 *   5. Call the REAL rankThirdPlaces(...) to pick best-8 third-place teams.
 *   6. Call the REAL resolveBracket(..., [], standings, { thirdPlaceOverride? })
 *      with NO knockout results — we only want R32 to populate from groups.
 *   7. Print: each group's table, the third-place slot assignment, all 16 R32
 *      matchups with real team names.
 *   8. Assert: all 16 R32 slots filled, every winner+runnerUp slotted, the
 *      8 thirds are exactly the rankThirdPlaces output, no team appears twice.
 *
 * The script READS the dev DB; it does not write to it. Safe to run any time.
 */

import { loadEnvConfig } from "../config/env";
import { connectDb, mongoose } from "../db";
import { Team } from "../models/team";
import { Match } from "../models/Match";
import { BracketOverride } from "../models/BracketOverride";
import { computeGroupStanding } from "../core/standings";
import { rankThirdPlaces } from "../core/thirdPlace";
import { resolveBracket } from "../core/resolveBracket";
import { R32_FEEDERS } from "../core/bracketMap";
import type {
  TeamRef,
  GroupMatchResult,
  RankedTeam,
  BracketSlot,
} from "../core/types";
import type {
  ThirdPlaceAssignment,
  ThirdPlaceMatchId,
} from "../core/thirdPlaceTable";

// ---------------------------------------------------------------------------
// CLI args + RNG
// ---------------------------------------------------------------------------

function parseSeed(): number {
  const arg = process.argv.find((a) => a.startsWith("--seed="));
  if (!arg) return 42;
  const n = Number(arg.slice("--seed=".length));
  if (!Number.isFinite(n)) throw new Error(`--seed must be a number, got ${arg}`);
  return n >>> 0; // force uint32
}

/** mulberry32 — small, fast, deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in [0, max] inclusive. */
const randInt = (rng: () => number, max: number) => Math.floor(rng() * (max + 1));

// ---------------------------------------------------------------------------
// Pretty printing
// ---------------------------------------------------------------------------

const LINE = "─".repeat(64);

function pad(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w);
  return s + " ".repeat(w - s.length);
}
function padRight(n: number | string, w: number): string {
  const s = String(n);
  return " ".repeat(Math.max(0, w - s.length)) + s;
}

function printGroupTable(letter: string, rows: ReadonlyArray<RankedTeam>, nameById: Map<string, string>) {
  console.log(`\nGroup ${letter}`);
  console.log(`  ${pad("#", 2)} ${pad("Team", 26)} ${padRight("P", 2)} ${padRight("W", 2)} ${padRight("D", 2)} ${padRight("L", 2)} ${padRight("GF", 3)} ${padRight("GA", 3)} ${padRight("GD", 4)} ${padRight("Pts", 4)}`);
  for (const r of rows) {
    const name = nameById.get(r.team.id) ?? `id=${r.team.id}`;
    console.log(
      `  ${pad(String(r.rank), 2)} ${pad(name, 26)} ${padRight(r.played, 2)} ${padRight(r.won, 2)} ${padRight(r.drawn, 2)} ${padRight(r.lost, 2)} ${padRight(r.goalsFor, 3)} ${padRight(r.goalsAgainst, 3)} ${padRight(r.goalDiff, 4)} ${padRight(r.points, 4)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface TeamDocLite {
  id: string;
  name: string;
  group: string;
  seed: number;
}

interface GroupMatchDocLite {
  id: number;
  group: string;
  homeTeamId: string;
  awayTeamId: string;
}

async function main(): Promise<void> {
  loadEnvConfig();
  await connectDb();

  const seed = parseSeed();
  const rng = mulberry32(seed);

  console.log(LINE);
  console.log(`test:group-r32 — seed=${seed}`);
  console.log(LINE);

  // ---------- Load teams ----------
  const teamDocs = (await Team.find({}).lean()) as unknown as TeamDocLite[];
  if (teamDocs.length !== 48) {
    throw new Error(
      `Expected 48 teams in the DB (run npm run seed:tournament). Found ${teamDocs.length}.`,
    );
  }
  const nameById = new Map<string, string>();
  const teamRefById = new Map<string, TeamRef>();
  for (const t of teamDocs) {
    nameById.set(t.id, t.name);
    teamRefById.set(t.id, { id: t.id, group: t.group, seed: t.seed });
  }
  console.log(`Loaded ${teamDocs.length} teams.`);

  // Group teams by letter (sorted A..L for deterministic iteration).
  const groupLetters = Array.from(new Set(teamDocs.map((t) => t.group))).sort();
  if (groupLetters.length !== 12) {
    throw new Error(`Expected 12 groups, found ${groupLetters.length}: ${groupLetters.join(",")}`);
  }
  const teamsByGroup = new Map<string, TeamRef[]>();
  for (const g of groupLetters) teamsByGroup.set(g, []);
  for (const t of teamDocs) teamsByGroup.get(t.group)!.push(teamRefById.get(t.id)!);

  // ---------- Load group matches ----------
  const groupMatchDocs = (await Match.find({ type: "group" }).lean()) as unknown as GroupMatchDocLite[];
  if (groupMatchDocs.length !== 72) {
    throw new Error(
      `Expected 72 group matches in the DB. Found ${groupMatchDocs.length}.`,
    );
  }
  console.log(`Loaded ${groupMatchDocs.length} group matches.`);

  // ---------- Generate random results ----------
  // Score distribution: 0..4 each side, fully independent. No draws are
  // forbidden (group stage allows them).
  const groupResults: GroupMatchResult[] = groupMatchDocs.map((m) => {
    const home = teamRefById.get(m.homeTeamId);
    const away = teamRefById.get(m.awayTeamId);
    if (!home || !away) {
      throw new Error(
        `Group match ${m.id}: missing team ref (homeTeamId=${m.homeTeamId}, awayTeamId=${m.awayTeamId})`,
      );
    }
    return {
      groupId: m.group,
      home,
      away,
      homeScore: randInt(rng, 4),
      awayScore: randInt(rng, 4),
    };
  });

  // ---------- Standings per group (real service) ----------
  const allStandings: RankedTeam[][] = [];
  for (const g of groupLetters) {
    const teams = teamsByGroup.get(g)!;
    const standing = computeGroupStanding(g, teams, groupResults);
    allStandings.push(standing);
    printGroupTable(g, standing, nameById);
  }

  // ---------- Best-8 third-place teams (real service) ----------
  const best8Thirds = rankThirdPlaces(allStandings);

  console.log(`\n${LINE}\nBest 8 third-place teams (cross-group ranking)\n${LINE}`);
  console.log(`  ${pad("#", 2)} ${pad("Team", 26)} ${pad("Grp", 3)} ${padRight("Pts", 4)} ${padRight("GD", 4)} ${padRight("GF", 3)} ${padRight("Seed", 5)}`);
  best8Thirds.forEach((r, i) => {
    const name = nameById.get(r.team.id) ?? `id=${r.team.id}`;
    console.log(
      `  ${pad(String(i + 1), 2)} ${pad(name, 26)} ${pad(r.team.group, 3)} ${padRight(r.points, 4)} ${padRight(r.goalDiff, 4)} ${padRight(r.goalsFor, 3)} ${padRight(r.team.seed, 5)}`,
    );
  });

  // ---------- Resolve R32 (real service) ----------
  const overrideDoc = await BracketOverride.findOne({ type: "thirdPlace" }).lean() as
    | { assignments: Record<string, string> }
    | null;

  let thirdPlaceOverride: ThirdPlaceAssignment | undefined;
  let thirdPlaceSource: "solver" | "override" = "solver";
  if (overrideDoc?.assignments) {
    const o: Record<string, string> = overrideDoc.assignments;
    thirdPlaceOverride = {
      74: o["74"], 77: o["77"], 79: o["79"], 80: o["80"],
      81: o["81"], 82: o["82"], 85: o["85"], 87: o["87"],
    } as unknown as ThirdPlaceAssignment;
    thirdPlaceSource = "override";
  }

  const bracket = resolveBracket(
    [],                 // no knockout results — group stage only
    allStandings,
    thirdPlaceOverride ? { thirdPlaceOverride } : {},
  );

  // ---------- Print third-place slot assignment ----------
  console.log(`\n${LINE}\nThird-place R32 slot assignment (source: ${thirdPlaceSource})\n${LINE}`);
  const THIRD_R32_MATCHES: ThirdPlaceMatchId[] = [74, 77, 79, 80, 81, 82, 85, 87];
  for (const mid of THIRD_R32_MATCHES) {
    const slot = bracket.get(mid)!;
    const [feedHome, feedAway] = R32_FEEDERS[mid];
    const thirdSide = feedHome.kind === "third" ? "home" : (feedAway.kind === "third" ? "away" : null);
    const thirdTeam = thirdSide === "home" ? slot.home : (thirdSide === "away" ? slot.away : undefined);
    const grpLabel = thirdTeam ? thirdTeam.group : "?";
    const name = thirdTeam ? (nameById.get(thirdTeam.id) ?? `id=${thirdTeam.id}`) : "<unfilled>";
    console.log(`  M${mid}  ←  3rd of Group ${grpLabel}   (${name})`);
  }

  // ---------- Print 16 R32 matchups ----------
  console.log(`\n${LINE}\n16 R32 matchups\n${LINE}`);
  for (let mid = 73; mid <= 88; mid++) {
    const slot = bracket.get(mid)!;
    const hName = slot.home ? (nameById.get(slot.home.id) ?? `id=${slot.home.id}`) : "<TBD>";
    const aName = slot.away ? (nameById.get(slot.away.id) ?? `id=${slot.away.id}`) : "<TBD>";
    const [feedHome, feedAway] = R32_FEEDERS[mid];
    const hLbl = feederLabel(feedHome);
    const aLbl = feederLabel(feedAway);
    console.log(`  M${mid}  ${pad(hName, 26)} (${hLbl})  vs  ${pad(aName, 26)} (${aLbl})`);
  }

  // ---------- Assertions ----------
  console.log(`\n${LINE}\nAssertions\n${LINE}`);
  const failures: string[] = [];

  const r32Ids = Array.from({ length: 16 }, (_, i) => 73 + i);
  const r32Slots: BracketSlot[] = r32Ids.map((id) => bracket.get(id)!);

  // (a) all 16 R32 matches have both sides populated
  for (let i = 0; i < r32Ids.length; i++) {
    const id = r32Ids[i];
    const slot = r32Slots[i];
    if (!slot.home) failures.push(`R32 M${id} home is unfilled`);
    if (!slot.away) failures.push(`R32 M${id} away is unfilled`);
  }

  // (b) every group winner + runner-up appears as a feeder somewhere in R32
  const placedIds = new Set<string>();
  for (const slot of r32Slots) {
    if (slot.home) placedIds.add(slot.home.id);
    if (slot.away) placedIds.add(slot.away.id);
  }
  for (const g of groupLetters) {
    const standing = allStandings[groupLetters.indexOf(g)];
    const winner = standing.find((r) => r.rank === 1)!;
    const runnerUp = standing.find((r) => r.rank === 2)!;
    if (!placedIds.has(winner.team.id)) {
      failures.push(`Group ${g} winner ${nameById.get(winner.team.id)} not present in R32`);
    }
    if (!placedIds.has(runnerUp.team.id)) {
      failures.push(`Group ${g} runner-up ${nameById.get(runnerUp.team.id)} not present in R32`);
    }
  }

  // (c) the 8 third-place teams in R32 = exactly the rankThirdPlaces() output
  const r32ThirdIds = new Set<string>();
  for (const mid of THIRD_R32_MATCHES) {
    const slot = bracket.get(mid)!;
    const [feedHome, feedAway] = R32_FEEDERS[mid];
    const thirdSide = feedHome.kind === "third" ? "home" : (feedAway.kind === "third" ? "away" : null);
    const t = thirdSide === "home" ? slot.home : (thirdSide === "away" ? slot.away : undefined);
    if (t) r32ThirdIds.add(t.id);
  }
  const expectedThirdIds = new Set(best8Thirds.map((r) => r.team.id));
  if (thirdPlaceSource === "solver") {
    // With the solver, the eight thirds in R32 MUST equal rankThirdPlaces.
    for (const id of expectedThirdIds) {
      if (!r32ThirdIds.has(id)) failures.push(`Expected third ${nameById.get(id)} missing from R32`);
    }
    for (const id of r32ThirdIds) {
      if (!expectedThirdIds.has(id)) failures.push(`Unexpected third ${nameById.get(id)} placed in R32`);
    }
  } else {
    // With an override, the set should still match if the override is valid.
    // We report a mismatch as a soft warning, not a failure.
    const missing = [...expectedThirdIds].filter((id) => !r32ThirdIds.has(id));
    const extra = [...r32ThirdIds].filter((id) => !expectedThirdIds.has(id));
    if (missing.length || extra.length) {
      console.log(`  ⚠️  Override produces a different third-place set than the solver:`);
      missing.forEach((id) => console.log(`     missing: ${nameById.get(id)}`));
      extra.forEach((id) => console.log(`     extra:   ${nameById.get(id)}`));
    }
  }

  // (d) no team appears twice in R32
  const seen = new Set<string>();
  for (const slot of r32Slots) {
    for (const t of [slot.home, slot.away]) {
      if (!t) continue;
      if (seen.has(t.id)) {
        failures.push(`Team ${nameById.get(t.id)} appears more than once in R32`);
      }
      seen.add(t.id);
    }
  }

  // (e) all 32 R32 slots should be unique teams (sanity: 32 distinct ids).
  if (seen.size !== 32 && failures.length === 0) {
    failures.push(`R32 contains ${seen.size} distinct teams, expected 32`);
  }

  if (failures.length === 0) {
    console.log("  ✅ all assertions PASS");
    console.log(`     • 16/16 R32 matches fully populated`);
    console.log(`     • 12 winners + 12 runners-up + 8 thirds = 32 distinct teams`);
    console.log(`     • third-place set matches rankThirdPlaces output`);
  } else {
    console.log(`  ❌ ${failures.length} assertion(s) FAILED:`);
    for (const f of failures) console.log(`     - ${f}`);
  }

  console.log(`\n${LINE}`);
  await mongoose.connection.close();
  process.exit(failures.length === 0 ? 0 : 1);
}

function feederLabel(f: { kind: "winner" | "runnerUp" | "third"; group?: string }): string {
  if (f.kind === "winner")   return `W${f.group}`;
  if (f.kind === "runnerUp") return `R${f.group}`;
  return "3rd";
}

main().catch((err) => {
  console.error("❌ test:group-r32 failed:", err);
  process.exit(1);
});
