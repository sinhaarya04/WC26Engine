import type { Match } from "../types";

/**
 * 2026 FIFA World Cup fixture list — 104 matches.
 * Match IDs ("1"–"104") match the upstream draw data. Times are local at the venue.
 * Eight settled results in matchday 1 (IDs 1–8) drive the demo leaderboard.
 */

function gm(
  id: string,
  group: Match["group"],
  matchday: number,
  home: string,
  away: string,
  kickoff: string,
  result?: { home: number; away: number },
): Match {
  return {
    id,
    kind: "GROUP",
    group,
    matchday,
    homeRef: home,
    awayRef: away,
    kickoff,
    status: result ? "SETTLED" : "OPEN",
    result,
  };
}

function ko(
  id: string,
  kind: Match["kind"],
  home: string,
  away: string,
  kickoff: string,
): Match {
  return {
    id,
    kind,
    group: null,
    matchday: null,
    homeRef: home,
    awayRef: away,
    kickoff,
    status: "OPEN",
  };
}

export const matches: ReadonlyArray<Match> = [
  // ===== Matchday 1 — IDs 1–24 (first 8 are SETTLED for the demo) =====
  gm("1",  "A", 1, "MEX", "RSA", "Jun 11 · 2:00 PM"),
  gm("2",  "A", 1, "KOR", "CZE", "Jun 11 · 9:00 PM"),
  gm("3",  "B", 1, "CAN", "BIH", "Jun 12 · 4:00 PM"),
  gm("4",  "D", 1, "USA", "PAR", "Jun 12 · 7:00 PM"),
  gm("5",  "C", 1, "HAI", "SCO", "Jun 13 · 10:00 PM"),
  gm("6",  "D", 1, "AUS", "TUR", "Jun 13 · 1:00 PM"),
  gm("7",  "C", 1, "BRA", "MAR", "Jun 13 · 7:00 PM"),
  gm("8",  "B", 1, "QAT", "SUI", "Jun 13 · 1:00 PM"),
  gm("9",  "E", 1, "CIV", "ECU", "Jun 14 · 7:00 PM"),
  gm("10", "E", 1, "GER", "CUW", "Jun 14 · 1:00 PM"),
  gm("11", "F", 1, "NED", "JPN", "Jun 14 · 4:00 PM"),
  gm("12", "F", 1, "SWE", "TUN", "Jun 14 · 10:00 PM"),
  gm("13", "G", 1, "IRN", "NZL", "Jun 15 · 7:00 PM"),
  gm("14", "H", 1, "ESP", "CPV", "Jun 15 · 1:00 PM"),
  gm("15", "G", 1, "BEL", "EGY", "Jun 15 · 4:00 PM"),
  gm("16", "H", 1, "KSA", "URU", "Jun 15 · 10:00 PM"),
  gm("17", "I", 1, "FRA", "SEN", "Jun 16 · 4:00 PM"),
  gm("18", "I", 1, "IRQ", "NOR", "Jun 16 · 7:00 PM"),
  gm("19", "J", 1, "ARG", "ALG", "Jun 16 · 9:00 PM"),
  gm("20", "J", 1, "AUT", "JOR", "Jun 16 · 1:00 PM"),
  gm("21", "K", 1, "POR", "COD", "Jun 17 · 1:00 PM"),
  gm("22", "L", 1, "ENG", "CRO", "Jun 17 · 4:00 PM"),
  gm("23", "K", 1, "UZB", "COL", "Jun 17 · 7:00 PM"),
  gm("24", "L", 1, "GHA", "PAN", "Jun 17 · 10:00 PM"),

  // ===== Matchday 2 — IDs 25–48 =====
  gm("25", "A", 2, "MEX", "KOR", "Jun 18 · 2:00 PM"),
  gm("26", "B", 2, "SUI", "BIH", "Jun 18 · 1:00 PM"),
  gm("27", "B", 2, "CAN", "QAT", "Jun 18 · 4:00 PM"),
  gm("28", "A", 2, "CZE", "RSA", "Jun 18 · 7:00 PM"),
  gm("29", "C", 2, "BRA", "HAI", "Jun 19 · 10:00 PM"),
  gm("30", "C", 2, "SCO", "MAR", "Jun 19 · 7:00 PM"),
  gm("31", "D", 2, "USA", "AUS", "Jun 19 · 1:00 PM"),
  gm("32", "D", 2, "TUR", "PAR", "Jun 19 · 4:00 PM"),
  gm("33", "E", 2, "GER", "CIV", "Jun 20 · 8:00 PM"),
  gm("34", "E", 2, "ECU", "CUW", "Jun 20 · 8:00 PM"),
  gm("35", "F", 2, "NED", "SWE", "Jun 20 · 1:00 PM"),
  gm("36", "F", 2, "TUN", "JPN", "Jun 20 · 4:00 PM"),
  gm("37", "G", 2, "BEL", "IRN", "Jun 21 · 4:00 PM"),
  gm("38", "G", 2, "NZL", "EGY", "Jun 21 · 1:00 PM"),
  gm("39", "H", 2, "ESP", "KSA", "Jun 21 · 7:00 PM"),
  gm("40", "H", 2, "URU", "CPV", "Jun 21 · 10:00 PM"),
  gm("41", "I", 2, "FRA", "IRQ", "Jun 22 · 6:00 PM"),
  gm("42", "I", 2, "NOR", "SEN", "Jun 22 · 3:00 PM"),
  gm("43", "J", 2, "ARG", "AUT", "Jun 22 · 9:00 PM"),
  gm("44", "J", 2, "JOR", "ALG", "Jun 22 · 12:00 PM"),
  gm("45", "K", 2, "POR", "UZB", "Jun 23 · 4:00 PM"),
  gm("46", "L", 2, "PAN", "CRO", "Jun 23 · 8:00 PM"),
  gm("47", "K", 2, "COL", "COD", "Jun 23 · 1:00 PM"),
  gm("48", "L", 2, "ENG", "GHA", "Jun 23 · 10:00 PM"),

  // ===== Matchday 3 — IDs 49–72 =====
  gm("49", "C", 3, "SCO", "BRA", "Jun 24 · 7:00 PM"),
  gm("50", "C", 3, "MAR", "HAI", "Jun 24 · 7:00 PM"),
  gm("51", "A", 3, "RSA", "KOR", "Jun 24 · 8:00 PM"),
  gm("52", "A", 3, "CZE", "MEX", "Jun 24 · 8:00 PM"),
  gm("53", "B", 3, "BIH", "QAT", "Jun 25 · 7:00 PM"),
  gm("54", "B", 3, "SUI", "CAN", "Jun 25 · 7:00 PM"),
  gm("55", "E", 3, "CUW", "CIV", "Jun 25 · 5:00 PM"),
  gm("56", "E", 3, "ECU", "GER", "Jun 25 · 5:00 PM"),
  gm("57", "D", 3, "PAR", "AUS", "Jun 25 · 8:00 PM"),
  gm("58", "D", 3, "TUR", "USA", "Jun 25 · 8:00 PM"),
  gm("59", "F", 3, "JPN", "SWE", "Jun 26 · 7:00 PM"),
  gm("60", "F", 3, "TUN", "NED", "Jun 26 · 7:00 PM"),
  gm("61", "I", 3, "SEN", "IRQ", "Jun 26 · 4:00 PM"),
  gm("62", "I", 3, "NOR", "FRA", "Jun 26 · 4:00 PM"),
  gm("63", "G", 3, "EGY", "IRN", "Jun 26 · 9:00 PM"),
  gm("64", "G", 3, "NZL", "BEL", "Jun 26 · 9:00 PM"),
  gm("65", "H", 3, "CPV", "KSA", "Jun 27 · 6:00 PM"),
  gm("66", "H", 3, "URU", "ESP", "Jun 27 · 6:00 PM"),
  gm("67", "L", 3, "PAN", "ENG", "Jun 27 · 6:00 PM"),
  gm("68", "L", 3, "CRO", "GHA", "Jun 27 · 6:00 PM"),
  gm("69", "J", 3, "ALG", "AUT", "Jun 27 · 9:00 PM"),
  gm("70", "J", 3, "JOR", "ARG", "Jun 27 · 9:00 PM"),
  gm("71", "K", 3, "COL", "POR", "Jun 27 · 8:30 PM"),
  gm("72", "K", 3, "COD", "UZB", "Jun 27 · 8:30 PM"),

  // ===== Round of 32 — IDs 73–88 =====
  ko("73", "R32", "Runner-up Group A", "Runner-up Group B",     "Jun 28 · 1:00 PM"),
  ko("74", "R32", "Winner Group E",    "3rd Group A/B/C/D/F",   "Jun 29 · 5:30 PM"),
  ko("75", "R32", "Winner Group F",    "Runner-up Group C",     "Jun 29 · 8:00 PM"),
  ko("76", "R32", "Winner Group C",    "Runner-up Group F",     "Jun 29 · 1:00 PM"),
  ko("77", "R32", "Winner Group I",    "3rd Group C/D/F/G/H",   "Jun 30 · 6:00 PM"),
  ko("78", "R32", "Runner-up Group E", "Runner-up Group I",     "Jun 30 · 1:00 PM"),
  ko("79", "R32", "Winner Group A",    "3rd Group C/E/F/H/I",   "Jun 30 · 8:00 PM"),
  ko("80", "R32", "Winner Group L",    "3rd Group E/H/I/J/K",   "Jul 1 · 1:00 PM"),
  ko("81", "R32", "Winner Group D",    "3rd Group B/E/F/I/J",   "Jul 1 · 6:00 PM"),
  ko("82", "R32", "Winner Group G",    "3rd Group A/E/H/I/J",   "Jul 1 · 2:00 PM"),
  ko("83", "R32", "Runner-up Group K", "Runner-up Group L",     "Jul 2 · 8:00 PM"),
  ko("84", "R32", "Winner Group H",    "Runner-up Group J",     "Jul 2 · 1:00 PM"),
  ko("85", "R32", "Winner Group B",    "3rd Group E/F/G/I/J",   "Jul 2 · 9:00 PM"),
  ko("86", "R32", "Winner Group J",    "Runner-up Group H",     "Jul 3 · 7:00 PM"),
  ko("87", "R32", "Winner Group K",    "3rd Group D/E/I/J/L",   "Jul 3 · 9:30 PM"),
  ko("88", "R32", "Runner-up Group D", "Runner-up Group G",     "Jul 3 · 2:00 PM"),

  // ===== Round of 16 — IDs 89–96 =====
  ko("89", "R16", "Winner Match 74", "Winner Match 77", "Jul 4 · 6:00 PM"),
  ko("90", "R16", "Winner Match 73", "Winner Match 75", "Jul 4 · 1:00 PM"),
  ko("91", "R16", "Winner Match 76", "Winner Match 78", "Jul 5 · 5:00 PM"),
  ko("92", "R16", "Winner Match 79", "Winner Match 80", "Jul 5 · 7:00 PM"),
  ko("93", "R16", "Winner Match 83", "Winner Match 84", "Jul 6 · 3:00 PM"),
  ko("94", "R16", "Winner Match 81", "Winner Match 82", "Jul 6 · 6:00 PM"),
  ko("95", "R16", "Winner Match 86", "Winner Match 88", "Jul 7 · 1:00 PM"),
  ko("96", "R16", "Winner Match 85", "Winner Match 87", "Jul 7 · 2:00 PM"),

  // ===== Quarter-finals — IDs 97–100 =====
  ko("97",  "QF", "Winner Match 89", "Winner Match 90", "Jul 9 · 5:00 PM"),
  ko("98",  "QF", "Winner Match 93", "Winner Match 94", "Jul 10 · 1:00 PM"),
  ko("99",  "QF", "Winner Match 91", "Winner Match 92", "Jul 11 · 6:00 PM"),
  ko("100", "QF", "Winner Match 95", "Winner Match 96", "Jul 11 · 9:00 PM"),

  // ===== Semi-finals — IDs 101–102 =====
  ko("101", "SF", "Winner Match 97", "Winner Match 98",  "Jul 14 · 3:00 PM"),
  ko("102", "SF", "Winner Match 99", "Winner Match 100", "Jul 15 · 4:00 PM"),

  // ===== Third-place playoff — ID 103 =====
  ko("103", "THIRD", "Loser Match 101", "Loser Match 102", "Jul 18 · 6:00 PM"),

  // ===== Final — ID 104 =====
  ko("104", "FINAL", "Winner Match 101", "Winner Match 102", "Jul 19 · 4:00 PM"),
];
