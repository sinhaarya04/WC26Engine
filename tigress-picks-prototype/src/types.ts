export type GroupLetter =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L";

export type KnockoutRound = "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";

export interface Team {
  /** 3-letter FIFA code (used as id). */
  code: string;
  name: string;
  flag: string;
  group: GroupLetter;
}

/**
 * Group-stage match: home/away are concrete team codes.
 * Knockout match: home/away are symbolic slot labels (e.g. "Winner A",
 *   "Runner-up B", "3rd A/B/D/F", "Winner of M73"). Prototype is read-only here.
 */
export interface Match {
  id: string;
  kind: "GROUP" | KnockoutRound;
  group: GroupLetter | null;
  matchday: number | null;
  homeRef: string;
  awayRef: string;
  kickoff: string;             // human-readable kickoff for display
  status: "OPEN" | "SETTLED";
  result?: { home: number; away: number };
}

export interface User {
  id: string;
  name: string;
  company: string;
  companyId: string;
}

export interface Prediction {
  userId: string;
  matchId: string;
  home: number;
  away: number;
  locked?: boolean;
}

export type Filter =
  | { kind: "all" }
  | { kind: "group"; letter: GroupLetter }
  | { kind: "round"; round: KnockoutRound };
