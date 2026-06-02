/**
 * Group standings — FIFA tiebreaker cascade.
 *
 *   1. Points
 *   2. Overall goal difference
 *   3. Overall goals scored
 *   4. Head-to-head points among tied teams
 *   5. Head-to-head goal difference
 *   6. Head-to-head goals scored
 *   7. Fair-play points (STUBBED — we don't track cards)
 *   8. FIFA seed order (lower seed wins; deterministic final fallback)
 *
 * 3-way (and 4-way) ties: steps 4–6 are recomputed as a mini-table over
 * only the tied teams. If after H2H some teams untie and others remain
 * tied, the procedure recurses on the remaining tied subset (recomputing
 * the mini-table for *that* subset, not re-using the bigger one).
 *
 * The function is pure: identical inputs → identical output.
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
  // Be defensive: a caller may hand us results from every group.
  const groupResults = results.filter((r) => r.groupId === groupId);

  // Overall stats for each team in the group.
  const baseRows = teams.map((t) => statsForTeam(t, groupResults));

  // Apply the full cascade.
  const ordered = rankByOverallThenH2H(baseRows, groupResults);

  return ordered.map((row, i) => ({ ...row, rank: i + 1 }));
}

// ---------- Stats ----------

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

// ---------- Sorting + bucketing ----------

/** Comparator: lexicographically applies a list of numeric keys (ascending). */
type Key = (r: StandingsRow) => number;
const sortByKeys = (rows: ReadonlyArray<StandingsRow>, keys: ReadonlyArray<Key>): StandingsRow[] =>
  [...rows].sort((a, b) => {
    for (const k of keys) {
      const diff = k(a) - k(b);
      if (diff !== 0) return diff;
    }
    return 0;
  });

/** Group adjacent rows that are equal across every key in `keys`. */
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

// Step 1-3 / 4-6 comparators (same shape; the row stats differ).
const PTS_GD_GF: Key[] = [
  (r) => -r.points,
  (r) => -r.goalDiff,
  (r) => -r.goalsFor,
];

// ---------- Cascade ----------

function rankByOverallThenH2H(
  rows: ReadonlyArray<StandingsRow>,
  allResults: ReadonlyArray<GroupMatchResult>,
): StandingsRow[] {
  const sorted = sortByKeys(rows, PTS_GD_GF);
  const buckets = bucketsByKeys(sorted, PTS_GD_GF);
  return buckets.flatMap((b) => (b.length === 1 ? b : rankByH2H(b, allResults)));
}

/**
 * Resolve a tied bucket using H2H mini-table. Recurses on smaller tied
 * subsets (recomputing the mini-table for each subset) per the FIFA rule.
 */
function rankByH2H(
  tied: ReadonlyArray<StandingsRow>,
  allResults: ReadonlyArray<GroupMatchResult>,
): StandingsRow[] {
  if (tied.length <= 1) return [...tied];

  // Mini-results = matches where both teams are in the tied set.
  const tiedIds = new Set(tied.map((r) => r.team.id));
  const miniResults = allResults.filter(
    (r) => tiedIds.has(r.home.id) && tiedIds.has(r.away.id),
  );

  // Compute mini-stats for each tied team using only those matches.
  const miniRows = tied.map((r) => statsForTeam(r.team, miniResults));

  const sortedMini = sortByKeys(miniRows, PTS_GD_GF);
  const miniBuckets = bucketsByKeys(sortedMini, PTS_GD_GF);

  return miniBuckets.flatMap((bucket) => {
    if (bucket.length === 1) {
      // Map mini-row back to the original overall-stats row.
      return [findOriginal(bucket[0].team.id, tied)];
    }
    if (bucket.length === tied.length) {
      // No progress at this level: fall through to fair-play stub → seed.
      return rankByFairPlayThenSeed(tied);
    }
    // Smaller subset still tied: recurse with a *new* mini-table for it.
    const subset = bucket.map((m) => findOriginal(m.team.id, tied));
    return rankByH2H(subset, allResults);
  });
}

/** Step 7 (stub) → Step 8 (seed). */
function rankByFairPlayThenSeed(
  tied: ReadonlyArray<StandingsRow>,
): StandingsRow[] {
  const afterFairPlay = fairPlayHook(tied);
  if (afterFairPlay) return afterFairPlay;
  // Lower seed number wins.
  return [...tied].sort((a, b) => a.team.seed - b.team.seed);
}

/**
 * Fair-play hook. We don't track cards, so this always returns null and the
 * cascade falls through to seed order. Reserved for future implementation.
 */
function fairPlayHook(
  _tied: ReadonlyArray<StandingsRow>,
): StandingsRow[] | null {
  return null;
}

function findOriginal(
  teamId: string,
  rows: ReadonlyArray<StandingsRow>,
): StandingsRow {
  const r = rows.find((x) => x.team.id === teamId);
  if (!r) throw new Error(`Internal: lost track of team ${teamId} during H2H tiebreak`);
  return r;
}
