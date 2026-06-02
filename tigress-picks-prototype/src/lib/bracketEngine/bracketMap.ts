/**
 * Knockout dependency map.
 * Vendored from api-usa/src/core/bracketMap.ts — keep in sync.
 */

import type { GroupLetter } from "./thirdPlaceTable";

export type R32Feeder =
  | { kind: "winner";   group: GroupLetter }
  | { kind: "runnerUp"; group: GroupLetter }
  | { kind: "third" };

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

export type KOFeeder =
  | { kind: "winnerOf"; matchId: number }
  | { kind: "loserOf";  matchId: number };

export const KO_FEEDERS: Readonly<Record<number, readonly [KOFeeder, KOFeeder]>> = {
  89: [{ kind: "winnerOf", matchId: 74 }, { kind: "winnerOf", matchId: 77 }],
  90: [{ kind: "winnerOf", matchId: 73 }, { kind: "winnerOf", matchId: 75 }],
  91: [{ kind: "winnerOf", matchId: 76 }, { kind: "winnerOf", matchId: 78 }],
  92: [{ kind: "winnerOf", matchId: 79 }, { kind: "winnerOf", matchId: 80 }],
  93: [{ kind: "winnerOf", matchId: 83 }, { kind: "winnerOf", matchId: 84 }],
  94: [{ kind: "winnerOf", matchId: 81 }, { kind: "winnerOf", matchId: 82 }],
  95: [{ kind: "winnerOf", matchId: 86 }, { kind: "winnerOf", matchId: 88 }],
  96: [{ kind: "winnerOf", matchId: 85 }, { kind: "winnerOf", matchId: 87 }],
  97:  [{ kind: "winnerOf", matchId: 89 }, { kind: "winnerOf", matchId: 90 }],
  98:  [{ kind: "winnerOf", matchId: 93 }, { kind: "winnerOf", matchId: 94 }],
  99:  [{ kind: "winnerOf", matchId: 91 }, { kind: "winnerOf", matchId: 92 }],
  100: [{ kind: "winnerOf", matchId: 95 }, { kind: "winnerOf", matchId: 96 }],
  101: [{ kind: "winnerOf", matchId: 97 }, { kind: "winnerOf", matchId: 98 }],
  102: [{ kind: "winnerOf", matchId: 99 }, { kind: "winnerOf", matchId: 100 }],
  103: [{ kind: "loserOf",  matchId: 101 }, { kind: "loserOf",  matchId: 102 }],
  104: [{ kind: "winnerOf", matchId: 101 }, { kind: "winnerOf", matchId: 102 }],
};

export const ALL_KO_MATCH_IDS: ReadonlyArray<number> = Array.from(
  { length: 104 - 73 + 1 },
  (_, i) => 73 + i,
);
