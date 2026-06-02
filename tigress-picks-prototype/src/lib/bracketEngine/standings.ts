/**
 * Group standings — FIFA tiebreaker cascade.
 * Vendored from api-usa/src/core/standings.ts — keep in sync.
 */

import type {
  TeamRef,
  GroupMatchResult,
  StandingsRow,
  RankedTeam,
} from "./types";

export function computeGroupStanding(
  groupId: string,
  teams: ReadonlyArray<TeamRef>,
  results: ReadonlyArray<GroupMatchResult>,
): RankedTeam[] {
  const groupResults = results.filter((r) => r.groupId === groupId);
  const baseRows = teams.map((t) => statsForTeam(t, groupResults));
  const ordered = rankByOverallThenH2H(baseRows, groupResults);
  return ordered.map((row, i) => ({ ...row, rank: i + 1 }));
}

function statsForTeam(
  team: TeamRef,
  results: ReadonlyArray<GroupMatchResult>,
): StandingsRow {
  const row: StandingsRow = {
    team,
    played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
  };
  for (const r of results) {
    let mine: number;
    let theirs: number;
    if (r.home.id === team.id) {
      mine = r.homeScore; theirs = r.awayScore;
    } else if (r.away.id === team.id) {
      mine = r.awayScore; theirs = r.homeScore;
    } else {
      continue;
    }
    row.played++;
    row.goalsFor += mine;
    row.goalsAgainst += theirs;
    if (mine > theirs)      { row.won++;  row.points += 3; }
    else if (mine < theirs) { row.lost++; }
    else                    { row.drawn++; row.points += 1; }
  }
  row.goalDiff = row.goalsFor - row.goalsAgainst;
  return row;
}

type Key = (r: StandingsRow) => number;
const sortByKeys = (rows: ReadonlyArray<StandingsRow>, keys: ReadonlyArray<Key>): StandingsRow[] =>
  [...rows].sort((a, b) => {
    for (const k of keys) {
      const diff = k(a) - k(b);
      if (diff !== 0) return diff;
    }
    return 0;
  });

function bucketsByKeys(
  sorted: ReadonlyArray<StandingsRow>,
  keys: ReadonlyArray<Key>,
): StandingsRow[][] {
  const out: StandingsRow[][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && keys.every((k) => k(last[0]) === k(r))) {
      last.push(r);
    } else {
      out.push([r]);
    }
  }
  return out;
}

const PTS_GD_GF: Key[] = [
  (r) => -r.points,
  (r) => -r.goalDiff,
  (r) => -r.goalsFor,
];

function rankByOverallThenH2H(
  rows: ReadonlyArray<StandingsRow>,
  allResults: ReadonlyArray<GroupMatchResult>,
): StandingsRow[] {
  const sorted = sortByKeys(rows, PTS_GD_GF);
  const buckets = bucketsByKeys(sorted, PTS_GD_GF);
  return buckets.flatMap((b) => (b.length === 1 ? b : rankByH2H(b, allResults)));
}

function rankByH2H(
  tied: ReadonlyArray<StandingsRow>,
  allResults: ReadonlyArray<GroupMatchResult>,
): StandingsRow[] {
  if (tied.length <= 1) return [...tied];
  const tiedIds = new Set(tied.map((r) => r.team.id));
  const miniResults = allResults.filter(
    (r) => tiedIds.has(r.home.id) && tiedIds.has(r.away.id),
  );
  const miniRows = tied.map((r) => statsForTeam(r.team, miniResults));
  const sortedMini = sortByKeys(miniRows, PTS_GD_GF);
  const miniBuckets = bucketsByKeys(sortedMini, PTS_GD_GF);
  return miniBuckets.flatMap((bucket) => {
    if (bucket.length === 1) return [findOriginal(bucket[0].team.id, tied)];
    if (bucket.length === tied.length) return rankByFairPlayThenSeed(tied);
    const subset = bucket.map((m) => findOriginal(m.team.id, tied));
    return rankByH2H(subset, allResults);
  });
}

function rankByFairPlayThenSeed(
  tied: ReadonlyArray<StandingsRow>,
): StandingsRow[] {
  return [...tied].sort((a, b) => a.team.seed - b.team.seed);
}

function findOriginal(
  teamId: string,
  rows: ReadonlyArray<StandingsRow>,
): StandingsRow {
  const r = rows.find((x) => x.team.id === teamId);
  if (!r) throw new Error(`Internal: lost track of team ${teamId} during H2H tiebreak`);
  return r;
}
