/**
 * Leaderboard aggregation — pure, no I/O.
 *
 * Given a flat list of Score rows (already filtered by whatever scope the
 * caller wants) and the user docs that own them, fold into one row per user
 * with totals + tiebreaker counts, then sort and assign sequential ranks.
 *
 * Sort order (matches the Stage 5 spec, extended with finalisation time):
 *   1. total points              (desc)
 *   2. exactCount                (desc)   ← Score rows with exact=true
 *   3. outcomeCount              (desc)   ← Score rows with outcome=true
 *   4. finalisation time         (ASC — earlier wins)
 *
 * Finalisation time = the MAX of `submittedAt` across all of a user's
 * Prediction documents — i.e. the most recent time the user touched any
 * pick. Because edits update `submittedAt`, this is effectively "the moment
 * the user stopped changing their predictions". A user who locked in every
 * pick early has an early finalisation time; a user who waited or kept
 * tweaking has a late one. Earlier-finalising users rank higher on ties.
 * Users with no predictions have no finalisation time and sort AFTER any
 * user who does — they cannot win a tiebreak.
 *
 * Published-rules wording: "If two players are tied on points and on both
 * tiebreaker stats (exact-score count and correct-outcome count), the
 * player whose most recent prediction was submitted earlier ranks higher.
 * Editing a prediction resets that prediction's submission time."
 *
 * Ranking choice: SEQUENTIAL ranks. Ties share the sort position but receive
 * distinct, sequential rank numbers (1, 2, 3, …). With submission time as
 * the fourth key, true ties are effectively impossible (Date.now() is
 * unique per write), so sequential ranking now reflects a fully explainable
 * order. The fallback to ES2019-stable Array.sort iteration order only kicks
 * in for users with NO predictions, where finalisation time is undefined.
 */

import type { Types } from "mongoose";

export interface ScoreRow {
  userId:  Types.ObjectId | string;
  points:  number;
  exact:   boolean;
  outcome: boolean;
}

export interface UserRow {
  _id:       Types.ObjectId | string;
  name:      string;
  companyId: Types.ObjectId | string;
}

export interface CompanyNameRow {
  _id:  Types.ObjectId | string;
  name: string;
}

export interface LeaderboardEntry {
  rank:         number;
  userId:       string;
  name:         string;
  points:       number;
  exactCount:   number;
  outcomeCount: number;
  /** Present only on /leaderboard/overall (cross-company). */
  companyName?: string;
}

/** Convert any id-ish value to its canonical string form. */
function idStr(v: Types.ObjectId | string): string {
  return typeof v === "string" ? v : v.toString();
}

/**
 * Build leaderboard rows for the given users. Score rows belonging to users
 * NOT in `users` are silently ignored (lets the caller scope by company by
 * pre-filtering users).
 *
 * If `companyNamesById` is provided, each row carries `companyName`.
 * Otherwise rows omit that field — used for the company-scoped endpoint
 * where the company is implicit.
 *
 * `submissionTimes` maps userId → latest `Prediction.submittedAt`. Used only
 * as the final sort key (earlier wins). Missing/undefined entries sort
 * AFTER any user who has a timestamp.
 */
export function buildLeaderboard(
  users: UserRow[],
  scores: ScoreRow[],
  companyNamesById?: Map<string, string>,
  submissionTimes?: Map<string, Date>,
): LeaderboardEntry[] {
  // Initialise one accumulator per user so users with zero Score rows still
  // appear on the board with 0 points.
  const acc = new Map<string, {
    name:         string;
    companyId:    string;
    points:       number;
    exactCount:   number;
    outcomeCount: number;
  }>();
  for (const u of users) {
    acc.set(idStr(u._id), {
      name:         u.name,
      companyId:    idStr(u.companyId),
      points:       0,
      exactCount:   0,
      outcomeCount: 0,
    });
  }

  for (const s of scores) {
    const bucket = acc.get(idStr(s.userId));
    if (!bucket) continue; // out-of-scope user — drop
    bucket.points += s.points;
    if (s.exact)   bucket.exactCount   += 1;
    if (s.outcome) bucket.outcomeCount += 1;
  }

  const rows = Array.from(acc.entries()).map(([userId, b]) => {
    const row: LeaderboardEntry = {
      rank:         0, // assigned after sort
      userId,
      name:         b.name,
      points:       b.points,
      exactCount:   b.exactCount,
      outcomeCount: b.outcomeCount,
    };
    if (companyNamesById) {
      row.companyName = companyNamesById.get(b.companyId) ?? "";
    }
    return row;
  });

  rows.sort((a, b) => {
    if (b.points        !== a.points)        return b.points        - a.points;
    if (b.exactCount    !== a.exactCount)    return b.exactCount    - a.exactCount;
    if (b.outcomeCount  !== a.outcomeCount)  return b.outcomeCount  - a.outcomeCount;

    // Final tiebreaker: earliest finalisation time wins (ASC).
    const at = submissionTimes?.get(a.userId);
    const bt = submissionTimes?.get(b.userId);
    if (at && bt) {
      const dt = at.getTime() - bt.getTime();
      if (dt !== 0) return dt;
    } else if (at && !bt) {
      return -1; // a has a timestamp, b doesn't → a finalised, b didn't → a ranks higher
    } else if (!at && bt) {
      return 1;
    }
    return 0;
  });

  // Sequential ranks: 1, 2, 3 … even across ties.
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
