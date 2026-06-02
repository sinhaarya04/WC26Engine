import { describe, it, expect } from "vitest";
import { resolveBracket } from "./resolveBracket";
import {
  ALL_KO_MATCH_IDS,
  R32_FEEDERS,
  KO_FEEDERS,
} from "./bracketMap";
import type { KnockoutResult, RankedTeam, TeamRef } from "./types";
import type { GroupLetter } from "./thirdPlaceTable";

const GROUPS: GroupLetter[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
];

/** Build a 4-row standings array for a single group, identifying teams by
 *  synthetic ids "<letter>1".."<letter>4" mapped to ranks 1..4. */
function standingsFor(
  group: GroupLetter,
  /** Make rank-3 stats vary so rankThirdPlaces is deterministic via group letter
   *  when stats are otherwise identical (lowest letter wins). */
  thirdPts = 1,
): RankedTeam[] {
  const teams: TeamRef[] = [1, 2, 3, 4].map((pos) => ({
    id: `${group}${pos}`,
    group,
    seed: pos,
  }));
  return [1, 2, 3, 4].map((rank) => ({
    rank: rank as 1 | 2 | 3 | 4,
    team: teams[rank - 1],
    played: 3,
    won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, goalDiff: 0,
    points: rank === 3 ? thirdPts : (5 - rank) * 3,
  }));
}

/** Twelve complete group standings. All 12 thirds have identical stats so
 *  rankThirdPlaces sorts them by group letter — best 8 thirds are A..H. */
function fullStandings(): RankedTeam[][] {
  return GROUPS.map((g) => standingsFor(g, /* thirdPts */ 1));
}

/** A KnockoutResult where the home side wins 1-0. */
function homeWins(matchId: number): KnockoutResult {
  return { matchId, homeScore: 1, awayScore: 0 };
}

/** All 32 KO results — home always wins 1-0. */
function fullKOResults(): KnockoutResult[] {
  return ALL_KO_MATCH_IDS.map((id) => homeWins(id));
}

// ---------- Test 1: full bracket ----------

describe("resolveBracket — complete bracket", () => {
  it("fills every slot 73–104 with home, away, and winner; no orphans", () => {
    const bracket = resolveBracket(fullKOResults(), fullStandings());

    expect(bracket.size).toBe(32);

    for (const id of ALL_KO_MATCH_IDS) {
      const slot = bracket.get(id);
      expect(slot, `slot ${id} missing`).toBeDefined();
      expect(slot!.home, `slot ${id} has no home`).toBeDefined();
      expect(slot!.away, `slot ${id} has no away`).toBeDefined();
      expect(slot!.winner, `slot ${id} has no winner`).toBeDefined();
    }

    // Every R32 home/away that comes from a "winner Group X" feeder must be
    // that group's rank-1 team id ("X1").
    for (const [matchIdStr, [feedHome, feedAway]] of Object.entries(R32_FEEDERS)) {
      const id = Number(matchIdStr);
      const slot = bracket.get(id)!;
      if (feedHome.kind === "winner")    expect(slot.home!.id).toBe(`${feedHome.group}1`);
      if (feedHome.kind === "runnerUp")  expect(slot.home!.id).toBe(`${feedHome.group}2`);
      if (feedAway.kind === "winner")    expect(slot.away!.id).toBe(`${feedAway.group}1`);
      if (feedAway.kind === "runnerUp")  expect(slot.away!.id).toBe(`${feedAway.group}2`);
    }

    // R16+ winners must propagate from the upstream KO match per KO_FEEDERS.
    // Since the home side won every match, every winner equals the upstream
    // home side. Specifically: M89.home === winner(M74) === M74.home.
    for (const [matchIdStr, [feedHome, feedAway]] of Object.entries(KO_FEEDERS)) {
      const id = Number(matchIdStr);
      const slot = bracket.get(id)!;
      const upstreamHome = bracket.get(feedHome.matchId)!;
      const upstreamAway = bracket.get(feedAway.matchId)!;
      if (feedHome.kind === "winnerOf") {
        expect(slot.home!.id).toBe(upstreamHome.winner!.id);
      } else {
        // loserOf — the non-winner of upstream
        const expectedLoser =
          upstreamHome.winner!.id === upstreamHome.home!.id
            ? upstreamHome.away!.id
            : upstreamHome.home!.id;
        expect(slot.home!.id).toBe(expectedLoser);
      }
      if (feedAway.kind === "winnerOf") {
        expect(slot.away!.id).toBe(upstreamAway.winner!.id);
      } else {
        const expectedLoser =
          upstreamAway.winner!.id === upstreamAway.home!.id
            ? upstreamAway.away!.id
            : upstreamAway.home!.id;
        expect(slot.away!.id).toBe(expectedLoser);
      }
    }

    // Sanity: M104 (the Final) is fully resolved.
    const final = bracket.get(104)!;
    expect(final.home).toBeDefined();
    expect(final.away).toBeDefined();
    expect(final.winner).toBeDefined();
  });
});

// ---------- Test 2: partial results ----------

describe("resolveBracket — partial results", () => {
  it("leaves downstream matches unresolved when an upstream result is missing", () => {
    // All results EXCEPT M73 are supplied.
    const results = fullKOResults().filter((r) => r.matchId !== 73);
    const bracket = resolveBracket(results, fullStandings());

    // M73: home + away seeded (group standings are complete), but no winner.
    const m73 = bracket.get(73)!;
    expect(m73.home).toBeDefined();
    expect(m73.away).toBeDefined();
    expect(m73.winner).toBeUndefined();

    // M90 (winnerOf 73 vs winnerOf 75): home (winner of 73) undefined,
    // away (winner of 75) defined, no winner.
    const m90 = bracket.get(90)!;
    expect(m90.home).toBeUndefined();
    expect(m90.away).toBeDefined();
    expect(m90.winner).toBeUndefined();

    // M97 (winnerOf 89 vs winnerOf 90): home (winner of 89) defined,
    // away (winner of 90) undefined, no winner.
    const m97 = bracket.get(97)!;
    expect(m97.home).toBeDefined();
    expect(m97.away).toBeUndefined();
    expect(m97.winner).toBeUndefined();

    // M101 (winnerOf 97 vs winnerOf 98): home undefined, away defined, no winner.
    const m101 = bracket.get(101)!;
    expect(m101.home).toBeUndefined();
    expect(m101.away).toBeDefined();
    expect(m101.winner).toBeUndefined();

    // M104 (Final, winnerOf 101 vs winnerOf 102): home undefined, away defined, no winner.
    const m104 = bracket.get(104)!;
    expect(m104.home).toBeUndefined();
    expect(m104.away).toBeDefined();
    expect(m104.winner).toBeUndefined();

    // Matches on the OTHER side of the bracket from M73 should still resolve.
    const m96 = bracket.get(96)!;
    expect(m96.home).toBeDefined();
    expect(m96.away).toBeDefined();
    expect(m96.winner).toBeDefined();
  });

  it("leaves R32 third-place slots empty when standings are incomplete", () => {
    // Drop the last group entirely — fewer than 12 groups complete.
    const partialStandings = fullStandings().slice(0, 11);
    const bracket = resolveBracket(fullKOResults(), partialStandings);

    // M74 needs a third-place team on the away side — undefined.
    expect(bracket.get(74)!.away).toBeUndefined();
    // Group A winner is still known, so M74.home (Winner E) is defined.
    expect(bracket.get(74)!.home).toBeDefined();
  });
});

// ---------- Test 3: KO level on score with no winnerTeamId ----------

describe("resolveBracket — KO draw without winnerTeamId", () => {
  it("leaves match unresolved and does not populate downstream slots", () => {
    const results: KnockoutResult[] = fullKOResults().map((r) =>
      r.matchId === 73 ? { matchId: 73, homeScore: 1, awayScore: 1 } : r,
    );
    const bracket = resolveBracket(results, fullStandings());

    // M73: both teams seeded, but level on score with no winnerTeamId → unresolved.
    const m73 = bracket.get(73)!;
    expect(m73.home).toBeDefined();
    expect(m73.away).toBeDefined();
    expect(m73.winner).toBeUndefined();

    // M90 (winnerOf 73 vs winnerOf 75) — home side unresolved.
    const m90 = bracket.get(90)!;
    expect(m90.home).toBeUndefined();
    expect(m90.away).toBeDefined();
    expect(m90.winner).toBeUndefined();
  });

  it("RESOLVES a level-score KO match when winnerTeamId is supplied", () => {
    // Same M73 = 1-1, but this time the result carries winnerTeamId = "A2"
    // (Runner-up A in our synthetic standings).
    const results: KnockoutResult[] = fullKOResults().map((r) =>
      r.matchId === 73
        ? { matchId: 73, homeScore: 1, awayScore: 1, winnerTeamId: "A2" }
        : r,
    );
    const bracket = resolveBracket(results, fullStandings());

    const m73 = bracket.get(73)!;
    expect(m73.home!.id).toBe("A2");
    expect(m73.away!.id).toBe("B2");
    expect(m73.winner!.id).toBe("A2");

    // Downstream M90.home is now "A2".
    expect(bracket.get(90)!.home!.id).toBe("A2");
  });
});

// ---------- Test 4: determinism ----------

describe("resolveBracket — determinism", () => {
  it("produces identical bracket regardless of results insertion order", () => {
    const standings = fullStandings();
    const results = fullKOResults();
    const shuffled = [...results].reverse();

    const a = resolveBracket(results,  standings);
    const b = resolveBracket(shuffled, standings);

    expect(a.size).toBe(b.size);
    for (const id of ALL_KO_MATCH_IDS) {
      const sa = a.get(id)!;
      const sb = b.get(id)!;
      expect(sa.home?.id).toBe(sb.home?.id);
      expect(sa.away?.id).toBe(sb.away?.id);
      expect(sa.winner?.id).toBe(sb.winner?.id);
    }
  });

  it("produces identical bracket regardless of standings array order", () => {
    const results = fullKOResults();
    const standings = fullStandings();
    const reordered = [...standings].reverse();

    const a = resolveBracket(results, standings);
    const b = resolveBracket(results, reordered);

    for (const id of ALL_KO_MATCH_IDS) {
      const sa = a.get(id)!;
      const sb = b.get(id)!;
      expect(sa.home?.id).toBe(sb.home?.id);
      expect(sa.away?.id).toBe(sb.away?.id);
      expect(sa.winner?.id).toBe(sb.winner?.id);
    }
  });
});
