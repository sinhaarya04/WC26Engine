/**
 * test:full-bracket — walk the entire knockout chain end to end.
 *
 *   npm run test:full-bracket
 *   npm run test:full-bracket -- --seed=12345
 *
 * Builds on testGroupToR32: fills the group stage, then walks the KO bracket
 * round by round (R32 → R16 → QF → SF → 3rd / Final), feeding results back
 * into the REAL resolveBracket() each time and asserting the next round
 * populates with real teams. No logic is reimplemented; the only thing the
 * script "owns" is the random-result generator.
 *
 * Knockout rules exercised:
 *   - Most matches decided on the field (winner scores more).
 *   - ~25% of matches resolved as level-on-the-field + winnerTeamId set, so
 *     the resolver's "no draws — pick by winnerTeamId" branch is exercised.
 *   - Third-place playoff fed by loserOf(SF) on both sides.
 *
 * Read-only against the DB. Pass `--seed=N` for reproducibility.
 */

import { loadEnvConfig } from "../config/env";
import { connectDb, mongoose } from "../db";
import { Team } from "../models/team";
import { Match } from "../models/Match";
import { BracketOverride } from "../models/BracketOverride";
import { computeGroupStanding } from "../core/standings";
import { resolveBracket } from "../core/resolveBracket";
import { KO_FEEDERS } from "../core/bracketMap";
import type {
  TeamRef,
  GroupMatchResult,
  KnockoutResult,
  RankedTeam,
  BracketSlot,
} from "../core/types";
import type { ThirdPlaceAssignment } from "../core/thirdPlaceTable";

// ---------------------------------------------------------------------------
// CLI args + RNG
// ---------------------------------------------------------------------------

function parseSeed(): number {
  const arg = process.argv.find((a) => a.startsWith("--seed="));
  if (!arg) return 42;
  const n = Number(arg.slice("--seed=".length));
  if (!Number.isFinite(n)) throw new Error(`--seed must be a number, got ${arg}`);
  return n >>> 0;
}

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
const randInt = (rng: () => number, max: number) => Math.floor(rng() * (max + 1));

// ---------------------------------------------------------------------------
// Pretty
// ---------------------------------------------------------------------------

const LINE = "─".repeat(72);
const pad = (s: string, w: number) => (s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length));

// ---------------------------------------------------------------------------
// Knockout result generation
// ---------------------------------------------------------------------------

/**
 * Generate a KnockoutResult for `matchId`, given the resolved slot. Picks a
 * random winner from {home, away}. Roughly 75% of matches finish on the
 * field (one side strictly outscores the other); the rest end level on
 * score with winnerTeamId set, exercising the resolver's tiebreak branch.
 */
function makeKoResult(matchId: number, slot: BracketSlot, rng: () => number): KnockoutResult {
  if (!slot.home || !slot.away) {
    throw new Error(`makeKoResult M${matchId}: slot not fully populated`);
  }
  const homeWins = rng() < 0.5;
  const decideLevel = rng() < 0.25; // ~25% level → exercise winnerTeamId path
  if (decideLevel) {
    const equalScore = randInt(rng, 3);
    return {
      matchId,
      homeScore: equalScore,
      awayScore: equalScore,
      winnerTeamId: (homeWins ? slot.home.id : slot.away.id),
    };
  }
  // Decided on the field: winner gets +1..+3, loser gets 0..(winner-1).
  const winnerGoals = 1 + randInt(rng, 3);     // 1..4
  const loserGoals  = randInt(rng, Math.max(0, winnerGoals - 1));
  return homeWins
    ? { matchId, homeScore: winnerGoals, awayScore: loserGoals }
    : { matchId, homeScore: loserGoals,  awayScore: winnerGoals };
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

interface RoundSpec {
  name: string;
  matchIds: number[];
  nextName: string;
  nextMatchIds: number[]; // empty for the final round
}

const ROUNDS: RoundSpec[] = [
  { name: "R32", matchIds: range(73, 88), nextName: "R16", nextMatchIds: range(89, 96) },
  { name: "R16", matchIds: range(89, 96), nextName: "QF",  nextMatchIds: range(97, 100) },
  { name: "QF",  matchIds: range(97, 100), nextName: "SF",  nextMatchIds: [101, 102] },
  { name: "SF",  matchIds: [101, 102],    nextName: "3rd+Final", nextMatchIds: [103, 104] },
  { name: "3rd+Final", matchIds: [103, 104], nextName: "—", nextMatchIds: [] },
];

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

async function main(): Promise<void> {
  loadEnvConfig();
  await connectDb();

  const seed = parseSeed();
  const rng = mulberry32(seed);

  console.log(LINE);
  console.log(`test:full-bracket — seed=${seed}`);
  console.log(LINE);

  // ---------- Load teams + matches ----------
  const teamDocs = (await Team.find({}).lean()) as unknown as TeamDocLite[];
  if (teamDocs.length !== 48) {
    throw new Error(`Expected 48 teams; found ${teamDocs.length}. Run npm run seed:tournament.`);
  }
  const nameById = new Map<string, string>();
  const teamRefById = new Map<string, TeamRef>();
  for (const t of teamDocs) {
    nameById.set(t.id, t.name);
    teamRefById.set(t.id, { id: t.id, group: t.group, seed: t.seed });
  }
  const teamName = (t: TeamRef | undefined) => (t ? (nameById.get(t.id) ?? `id=${t.id}`) : "<TBD>");

  const groupLetters = Array.from(new Set(teamDocs.map((t) => t.group))).sort();
  const teamsByGroup = new Map<string, TeamRef[]>();
  for (const g of groupLetters) teamsByGroup.set(g, []);
  for (const t of teamDocs) teamsByGroup.get(t.group)!.push(teamRefById.get(t.id)!);

  const groupMatchDocs = (await Match.find({ type: "group" }).lean()) as unknown as GroupMatchDocLite[];
  if (groupMatchDocs.length !== 72) {
    throw new Error(`Expected 72 group matches; found ${groupMatchDocs.length}.`);
  }

  // ---------- Group stage ----------
  const groupResults: GroupMatchResult[] = groupMatchDocs.map((m) => ({
    groupId: m.group,
    home: teamRefById.get(m.homeTeamId)!,
    away: teamRefById.get(m.awayTeamId)!,
    homeScore: randInt(rng, 4),
    awayScore: randInt(rng, 4),
  }));

  const allStandings: RankedTeam[][] = groupLetters.map((g) =>
    computeGroupStanding(g, teamsByGroup.get(g)!, groupResults),
  );

  // Optional override (verify-only label; we won't print it specially here).
  const overrideDoc = (await BracketOverride.findOne({ type: "thirdPlace" }).lean()) as
    | { assignments: Record<string, string> }
    | null;
  let thirdPlaceOverride: ThirdPlaceAssignment | undefined;
  let thirdPlaceSource: "solver" | "override" = "solver";
  if (overrideDoc?.assignments) {
    const o = overrideDoc.assignments;
    thirdPlaceOverride = {
      74: o["74"], 77: o["77"], 79: o["79"], 80: o["80"],
      81: o["81"], 82: o["82"], 85: o["85"], 87: o["87"],
    } as unknown as ThirdPlaceAssignment;
    thirdPlaceSource = "override";
  }

  console.log(`Group stage filled: 72 matches, 12 standings computed (third-place source: ${thirdPlaceSource}).`);

  // ---------- Walk the rounds ----------
  const koResults: KnockoutResult[] = [];
  const failures: string[] = [];

  // resolve helper, always called against current `koResults`.
  const resolve = () =>
    resolveBracket(koResults, allStandings, thirdPlaceOverride ? { thirdPlaceOverride } : {});

  // initial resolution (group stage only) — should fully populate R32.
  let bracket = resolve();
  assertRoundPopulated(bracket, ROUNDS[0].matchIds, ROUNDS[0].name, teamName, failures);

  // For each round: print matchups + winners, append results, resolve, assert next.
  for (let i = 0; i < ROUNDS.length; i++) {
    const round = ROUNDS[i];
    console.log(`\n${LINE}\n${round.name} — entering ${round.matchIds.length} result(s)\n${LINE}`);

    for (const mid of round.matchIds) {
      const slot = bracket.get(mid)!;
      if (!slot.home || !slot.away) {
        failures.push(`Cannot enter result for M${mid}: slot not populated before round ${round.name}`);
        continue;
      }
      const result = makeKoResult(mid, slot, rng);
      koResults.push(result);

      const winnerTeam =
        result.homeScore > result.awayScore ? slot.home
        : result.homeScore < result.awayScore ? slot.away
        : (result.winnerTeamId === slot.home.id ? slot.home : slot.away);

      const score = `${result.homeScore}-${result.awayScore}`;
      const tag = result.homeScore === result.awayScore ? " (winnerTeamId)" : "";
      console.log(
        `  M${mid}  ${pad(teamName(slot.home), 26)} ${pad(score, 5)} ${pad(teamName(slot.away), 26)}   →  ${teamName(winnerTeam)}${tag}`,
      );
    }

    // Re-resolve with the new results and assert the next round (if any).
    bracket = resolve();

    if (round.nextMatchIds.length > 0) {
      const beforeFail = failures.length;
      assertRoundPopulated(bracket, round.nextMatchIds, round.nextName, teamName, failures);

      // Per-match winner-advancement check: for each new-round match, both of
      // its feeders should have produced the team that now sits in the new slot.
      for (const nextMid of round.nextMatchIds) {
        const nextSlot = bracket.get(nextMid)!;
        const [fh, fa] = KO_FEEDERS[nextMid];
        const checkSide = (side: "home" | "away", feeder: typeof fh) => {
          const expected = expectedFromFeeder(feeder, bracket);
          const actual = side === "home" ? nextSlot.home : nextSlot.away;
          if (!expected || !actual) return; // missing — caught by the populated assertion
          if (expected.id !== actual.id) {
            failures.push(
              `M${nextMid}.${side}: expected ${teamName(expected)} (${feeder.kind} of M${feeder.matchId}) but bracket has ${teamName(actual)}`,
            );
          }
        };
        checkSide("home", fh);
        checkSide("away", fa);
      }

      const addedFails = failures.length - beforeFail;
      if (addedFails === 0) {
        console.log(`\n  ✅ ${round.nextName} populated: ${round.nextMatchIds.length}/${round.nextMatchIds.length} slots filled, winners advanced correctly.`);
      } else {
        console.log(`\n  ❌ ${round.nextName} populated WITH ${addedFails} FAILURES (see end of report).`);
      }
    }
  }

  // ---------- No-team-twice-per-round check ----------
  for (const round of ROUNDS) {
    const seen = new Set<string>();
    for (const mid of round.matchIds) {
      const slot = bracket.get(mid)!;
      for (const t of [slot.home, slot.away]) {
        if (!t) continue;
        if (seen.has(t.id)) {
          failures.push(`${round.name}: team ${teamName(t)} appears more than once`);
        }
        seen.add(t.id);
      }
    }
  }

  // ---------- Champion / runner-up / third ----------
  const finalSlot = bracket.get(104)!;
  const thirdSlot = bracket.get(103)!;

  console.log(`\n${LINE}\nResult\n${LINE}`);

  let champion: TeamRef | undefined;
  let runnerUp: TeamRef | undefined;
  let third: TeamRef | undefined;

  if (finalSlot.home && finalSlot.away && finalSlot.winner) {
    champion = finalSlot.winner;
    runnerUp = finalSlot.winner.id === finalSlot.home.id ? finalSlot.away : finalSlot.home;
    console.log(`  🏆 Champion:   ${teamName(champion)}`);
    console.log(`  🥈 Runner-up:  ${teamName(runnerUp)}`);
  } else {
    failures.push(`Final (M104) did not resolve: home=${teamName(finalSlot.home)} away=${teamName(finalSlot.away)} winner=${teamName(finalSlot.winner)}`);
  }
  if (thirdSlot.home && thirdSlot.away && thirdSlot.winner) {
    third = thirdSlot.winner;
    console.log(`  🥉 Third:      ${teamName(third)}`);
  } else {
    failures.push(`Third-place (M103) did not resolve: home=${teamName(thirdSlot.home)} away=${teamName(thirdSlot.away)} winner=${teamName(thirdSlot.winner)}`);
  }

  // Cross-check: third-place playoff feeders = the two SF losers
  const sf1 = bracket.get(101)!;
  const sf2 = bracket.get(102)!;
  const expectedThirdHome = sf1.winner && sf1.home && sf1.away
    ? (sf1.winner.id === sf1.home.id ? sf1.away : sf1.home)
    : undefined;
  const expectedThirdAway = sf2.winner && sf2.home && sf2.away
    ? (sf2.winner.id === sf2.home.id ? sf2.away : sf2.home)
    : undefined;
  if (expectedThirdHome && thirdSlot.home && expectedThirdHome.id !== thirdSlot.home.id) {
    failures.push(`M103 home should be SF1 loser (${teamName(expectedThirdHome)}) but got ${teamName(thirdSlot.home)}`);
  }
  if (expectedThirdAway && thirdSlot.away && expectedThirdAway.id !== thirdSlot.away.id) {
    failures.push(`M103 away should be SF2 loser (${teamName(expectedThirdAway)}) but got ${teamName(thirdSlot.away)}`);
  }

  // ---------- Final verdict ----------
  console.log(`\n${LINE}`);
  if (failures.length === 0) {
    console.log("✅ all rounds populated, all winners advanced correctly.");
  } else {
    console.log(`❌ ${failures.length} failure(s):`);
    for (const f of failures) console.log(`   - ${f}`);
  }
  console.log(LINE);

  await mongoose.connection.close();
  process.exit(failures.length === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function assertRoundPopulated(
  bracket: Map<number, BracketSlot>,
  ids: number[],
  roundName: string,
  teamName: (t: TeamRef | undefined) => string,
  failures: string[],
): void {
  for (const id of ids) {
    const slot = bracket.get(id)!;
    if (!slot.home) failures.push(`${roundName} M${id} home unfilled`);
    if (!slot.away) failures.push(`${roundName} M${id} away unfilled`);
  }
  void teamName;
}

function expectedFromFeeder(
  feeder: { kind: "winnerOf" | "loserOf"; matchId: number },
  bracket: Map<number, BracketSlot>,
): TeamRef | undefined {
  const upstream = bracket.get(feeder.matchId);
  if (!upstream || !upstream.winner) return undefined;
  if (feeder.kind === "winnerOf") return upstream.winner;
  if (!upstream.home || !upstream.away) return undefined;
  return upstream.winner.id === upstream.home.id ? upstream.away : upstream.home;
}

main().catch((err) => {
  console.error("❌ test:full-bracket failed:", err);
  process.exit(1);
});
