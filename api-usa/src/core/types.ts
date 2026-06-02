/**
 * Pure types for the bracket resolver. No mongoose / express references.
 * Same shapes are used for the "real" bracket (from admin-entered results)
 * and a user's "predicted" bracket (from their predictions).
 */

/** A team reference for ranking. `seed` is the deterministic tiebreaker. */
export interface TeamRef {
  /** Team identifier (FIFA code or numeric id, treated as opaque). */
  id: string;
  /** Group letter "A".."L". */
  group: string;
  /** FIFA seed — lower number is the higher seed. Final tiebreaker. */
  seed: number;
}

/** A completed (finished) group-stage match result. */
export interface GroupMatchResult {
  groupId: string;
  home: TeamRef;
  away: TeamRef;
  homeScore: number;
  awayScore: number;
}

/** Computed group-standings row before ranking. */
export interface StandingsRow {
  team: TeamRef;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

/** Final ranked row returned by `computeGroupStanding`. */
export interface RankedTeam extends StandingsRow {
  rank: number;
}

/**
 * A completed knockout-stage match result.
 *
 * Knockout matches cannot draw — if `homeScore === awayScore`, the team that
 * advanced after extra time / penalties is identified by `winnerTeamId`.
 * If scores are level AND `winnerTeamId` is missing (e.g. a user-predicted
 * draw with no winner pick), the resolver leaves the match unresolved.
 */
export interface KnockoutResult {
  matchId: number;
  homeScore: number;
  awayScore: number;
  /** Required when scores are level; identifies the advancing team. */
  winnerTeamId?: string;
}

/** One knockout slot in the resolved bracket. */
export interface BracketSlot {
  /** Filled when this slot's home feeder is determined. */
  home?: TeamRef;
  /** Filled when this slot's away feeder is determined. */
  away?: TeamRef;
  /** Filled only when a result determines a winner. Never guessed. */
  winner?: TeamRef;
}
