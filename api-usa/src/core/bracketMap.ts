/**
 * Verified bracket dependency map for the 2026 World Cup knockout stage.
 *
 *   R32 (73–88)  — each match's two feeders are either a group placement
 *                  ("Winner Group X" / "Runner-up Group Y") or one of the
 *                  eight third-place slots resolved via thirdPlaceTable.
 *   R16 (89–96)  — winnerOf(M74) v winnerOf(M77), etc.
 *   QF  (97–100) — winnerOf(M89) v winnerOf(M90), etc.
 *   SF  (101,102)
 *   3rd (103)    — loserOf(M101) v loserOf(M102)
 *   Final (104)  — winnerOf(M101) v winnerOf(M102)
 *
 * The R32 feeders mirror the published bracket labels exactly. The R16+ map
 * mirrors the dependency chain the user specified.
 */

import type { GroupLetter } from "./thirdPlaceTable";

// ---------- R32 feeder types ----------

export type R32Feeder =
  | { kind: "winner";   group: GroupLetter }
  | { kind: "runnerUp"; group: GroupLetter }
  /** Slot is filled by resolveThirdPlaceAssignment for this match id. */
  | { kind: "third" };

/** Each R32 match (73–88) and its two feeders. */
export const R32_FEEDERS: Readonly<Record<number, readonly [R32Feeder, R32Feeder]>> = {
  73: [{ kind: "runnerUp", group: "A" }, { kind: "runnerUp", group: "B" }],
  74: [{ kind: "winner",   group: "E" }, { kind: "third" }],
  75: [{ kind: "winner",   group: "F" }, { kind: "runnerUp", group: "C" }],
  76: [{ kind: "winner",   group: "C" }, { kind: "runnerUp", group: "F" }],
  77: [{ kind: "winner",   group: "I" }, { kind: "third" }],
  78: [{ kind: "runnerUp", group: "E" }, { kind: "runnerUp", group: "I" }],
  79: [{ kind: "winner",   group: "A" }, { kind: "third" }],
  80: [{ kind: "winner",   group: "L" }, { kind: "third" }],
  81: [{ kind: "winner",   group: "D" }, { kind: "third" }],
  82: [{ kind: "winner",   group: "G" }, { kind: "third" }],
  83: [{ kind: "runnerUp", group: "K" }, { kind: "runnerUp", group: "L" }],
  84: [{ kind: "winner",   group: "H" }, { kind: "runnerUp", group: "J" }],
  85: [{ kind: "winner",   group: "B" }, { kind: "third" }],
  86: [{ kind: "winner",   group: "J" }, { kind: "runnerUp", group: "H" }],
  87: [{ kind: "winner",   group: "K" }, { kind: "third" }],
  88: [{ kind: "runnerUp", group: "D" }, { kind: "runnerUp", group: "G" }],
};

// ---------- KO (89–104) feeder types ----------

export type KOFeeder =
  | { kind: "winnerOf"; matchId: number }
  | { kind: "loserOf";  matchId: number };

/** Each KO match (89–104) and its two feeders. */
export const KO_FEEDERS: Readonly<Record<number, readonly [KOFeeder, KOFeeder]>> = {
  // R16
  89: [{ kind: "winnerOf", matchId: 74 }, { kind: "winnerOf", matchId: 77 }],
  90: [{ kind: "winnerOf", matchId: 73 }, { kind: "winnerOf", matchId: 75 }],
  91: [{ kind: "winnerOf", matchId: 76 }, { kind: "winnerOf", matchId: 78 }],
  92: [{ kind: "winnerOf", matchId: 79 }, { kind: "winnerOf", matchId: 80 }],
  93: [{ kind: "winnerOf", matchId: 83 }, { kind: "winnerOf", matchId: 84 }],
  94: [{ kind: "winnerOf", matchId: 81 }, { kind: "winnerOf", matchId: 82 }],
  95: [{ kind: "winnerOf", matchId: 86 }, { kind: "winnerOf", matchId: 88 }],
  96: [{ kind: "winnerOf", matchId: 85 }, { kind: "winnerOf", matchId: 87 }],

  // QF
  97:  [{ kind: "winnerOf", matchId: 89 }, { kind: "winnerOf", matchId: 90 }],
  98:  [{ kind: "winnerOf", matchId: 93 }, { kind: "winnerOf", matchId: 94 }],
  99:  [{ kind: "winnerOf", matchId: 91 }, { kind: "winnerOf", matchId: 92 }],
  100: [{ kind: "winnerOf", matchId: 95 }, { kind: "winnerOf", matchId: 96 }],

  // SF
  101: [{ kind: "winnerOf", matchId: 97 }, { kind: "winnerOf", matchId: 98 }],
  102: [{ kind: "winnerOf", matchId: 99 }, { kind: "winnerOf", matchId: 100 }],

  // Third-place playoff
  103: [{ kind: "loserOf",  matchId: 101 }, { kind: "loserOf",  matchId: 102 }],

  // Final
  104: [{ kind: "winnerOf", matchId: 101 }, { kind: "winnerOf", matchId: 102 }],
};

/** Every knockout match id, in canonical resolution order. */
export const ALL_KO_MATCH_IDS: ReadonlyArray<number> = Array.from(
  { length: 104 - 73 + 1 },
  (_, i) => 73 + i,
);
