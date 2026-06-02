import type { Prediction } from "../types";

/**
 * Seeded predictions. Every user has a pick on each of the 8 settled matches
 * (IDs "1"–"8") so the leaderboard is non-trivial on first paint.
 * The current user (u1) also has picks on a couple of still-open matches.
 *
 * Settled results, for reference:
 *   1 MEX 2-1 RSA   2 KOR 1-1 CZE   3 CAN 2-0 BIH   4 USA 3-1 PAR
 *   5 HAI 0-2 SCO   6 AUS 1-1 TUR   7 BRA 2-0 MAR   8 QAT 0-1 SUI
 *
 * Expected totals: u3=31, u1=27, u5=23, u6=22, u2=18, u4=14.
 */
export const seedPredictions: Prediction[] = [
  // -- u1 Aryan Sinha (Acme) -- lock on opener; total 27
  { userId: "u1", matchId: "1", home: 2, away: 1, locked: true }, // exact x2 = 10
  { userId: "u1", matchId: "2", home: 1, away: 0 },               // miss
  { userId: "u1", matchId: "3", home: 1, away: 0 },               // winner = 3
  { userId: "u1", matchId: "4", home: 2, away: 1 },               // winner = 3
  { userId: "u1", matchId: "5", home: 1, away: 1 },               // miss
  { userId: "u1", matchId: "6", home: 1, away: 1 },               // exact = 5
  { userId: "u1", matchId: "7", home: 3, away: 1 },               // winner = 3
  { userId: "u1", matchId: "8", home: 0, away: 1 },               // winner = 3
  // Open-match picks already submitted (no extra lock — u1's lock is on match 1).
  { userId: "u1", matchId: "10", home: 2, away: 0 },
  { userId: "u1", matchId: "13", home: 2, away: 1 },

  // -- u2 Nina Caldarone (Acme) -- total 18
  { userId: "u2", matchId: "1", home: 1, away: 0 }, // winner = 3
  { userId: "u2", matchId: "2", home: 2, away: 2 }, // winner (draw) = 3
  { userId: "u2", matchId: "3", home: 1, away: 1 }, // miss
  { userId: "u2", matchId: "4", home: 2, away: 0 }, // winner = 3
  { userId: "u2", matchId: "5", home: 0, away: 1 }, // winner = 3
  { userId: "u2", matchId: "6", home: 0, away: 0 }, // winner (draw) = 3
  { userId: "u2", matchId: "7", home: 1, away: 0 }, // winner = 3
  { userId: "u2", matchId: "8", home: 1, away: 1 }, // miss

  // -- u3 Alex Lesko (Globex) -- lock on group B opener; total 31
  { userId: "u3", matchId: "1", home: 2, away: 1 },               // exact = 5
  { userId: "u3", matchId: "2", home: 1, away: 1 },               // exact = 5
  { userId: "u3", matchId: "3", home: 2, away: 0, locked: true }, // exact x2 = 10
  { userId: "u3", matchId: "4", home: 1, away: 0 },               // winner = 3
  { userId: "u3", matchId: "5", home: 0, away: 2 },               // exact = 5
  { userId: "u3", matchId: "6", home: 0, away: 1 },               // miss
  { userId: "u3", matchId: "7", home: 2, away: 1 },               // winner = 3
  { userId: "u3", matchId: "8", home: 1, away: 1 },               // miss

  // -- u4 Richi Urquidi (Globex) -- total 14
  { userId: "u4", matchId: "1", home: 1, away: 2 }, // miss
  { userId: "u4", matchId: "2", home: 1, away: 1 }, // exact = 5
  { userId: "u4", matchId: "3", home: 0, away: 1 }, // miss
  { userId: "u4", matchId: "4", home: 2, away: 1 }, // winner = 3
  { userId: "u4", matchId: "5", home: 1, away: 2 }, // winner = 3
  { userId: "u4", matchId: "6", home: 0, away: 0 }, // winner (draw) = 3
  { userId: "u4", matchId: "7", home: 0, away: 1 }, // miss
  { userId: "u4", matchId: "8", home: 2, away: 2 }, // miss

  // -- u5 Michael Lindley (Initech) -- total 23
  { userId: "u5", matchId: "1", home: 3, away: 1 }, // winner = 3
  { userId: "u5", matchId: "2", home: 0, away: 0 }, // winner (draw) = 3
  { userId: "u5", matchId: "3", home: 2, away: 0 }, // exact = 5
  { userId: "u5", matchId: "4", home: 2, away: 1 }, // winner = 3
  { userId: "u5", matchId: "5", home: 1, away: 2 }, // winner = 3
  { userId: "u5", matchId: "6", home: 2, away: 2 }, // winner (draw) = 3
  { userId: "u5", matchId: "7", home: 2, away: 2 }, // miss
  { userId: "u5", matchId: "8", home: 1, away: 2 }, // winner = 3

  // -- u6 Aryan Sinha (Initech) -- lock on group B closer; total 22
  { userId: "u6", matchId: "1", home: 2, away: 1 },               // exact = 5
  { userId: "u6", matchId: "2", home: 2, away: 1 },               // miss
  { userId: "u6", matchId: "3", home: 2, away: 1 },               // winner = 3
  { userId: "u6", matchId: "4", home: 1, away: 1 },               // miss
  { userId: "u6", matchId: "5", home: 0, away: 2 },               // exact = 5
  { userId: "u6", matchId: "6", home: 1, away: 2 },               // miss
  { userId: "u6", matchId: "7", home: 3, away: 0 },               // winner = 3
  { userId: "u6", matchId: "8", home: 0, away: 2, locked: true }, // winner x2 = 6
];
