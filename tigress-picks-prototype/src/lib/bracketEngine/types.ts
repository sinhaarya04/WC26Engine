/**
 * Pure types for the bracket resolver.
 * Vendored from api-usa/src/core/types.ts — keep in sync.
 */

export interface TeamRef {
  id: string;
  group: string;
  seed: number;
}

export interface GroupMatchResult {
  groupId: string;
  home: TeamRef;
  away: TeamRef;
  homeScore: number;
  awayScore: number;
}

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

export interface RankedTeam extends StandingsRow {
  rank: number;
}

export interface KnockoutResult {
  matchId: number;
  homeScore: number;
  awayScore: number;
  winnerTeamId?: string;
}

export interface BracketSlot {
  home?: TeamRef;
  away?: TeamRef;
  winner?: TeamRef;
}
