/**
 * Tests for /leaderboard/company and /leaderboard/overall.
 *
 * Mocks User, Score, and Company at the model level (same pattern as
 * bracket.controller.test.ts). Drives the handlers directly with synthetic
 * req/res so we exercise the full controller → service path without Mongo.
 *
 * The critical multi-tenant boundary test asserts that supplying a
 * different companyId in body/query/params is ignored — the controller
 * MUST read companyId only from req.companyId (the JWT claim).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/user", () => ({
  User: { find: vi.fn() },
}));
vi.mock("../models/Score", () => ({
  Score: { find: vi.fn() },
}));
vi.mock("../models/Company", () => ({
  Company: { find: vi.fn() },
}));
vi.mock("../models/Prediction", () => ({
  Prediction: { find: vi.fn() },
}));

import { User } from "../models/user";
import { Score } from "../models/Score";
import { Company } from "../models/Company";
import { Prediction } from "../models/Prediction";
import {
  getCompanyLeaderboard,
  getOverallLeaderboard,
} from "./leaderboard.controller";

// ---------- Fixtures ----------

const CO_A = "company-A";
const CO_B = "company-B";

const COMPANIES = [
  { _id: CO_A, name: "Tigress" },
  { _id: CO_B, name: "Beta"    },
];

// 3 users in Company A, 2 in Company B
const USERS = [
  { _id: "uA1", name: "Alice",  companyId: CO_A },
  { _id: "uA2", name: "Andrew", companyId: CO_A },
  { _id: "uA3", name: "Anya",   companyId: CO_A },
  { _id: "uB1", name: "Ben",    companyId: CO_B },
  { _id: "uB2", name: "Bea",    companyId: CO_B },
];

/** Helper: build a Score row stub. */
function score(
  userId: string,
  points: number,
  exact = false,
  outcome = false,
) {
  return { userId, matchId: 1, points, exact, gd: exact, outcome, advancement: false };
}

// Designed totals (sums of points):
//   Alice  = 12 + 7 + 3 = 22, exactCount=1, outcomeCount=3
//   Andrew = 12 + 7     = 19, exactCount=1, outcomeCount=2
//   Anya   = 7  + 3     = 10, exactCount=0, outcomeCount=2
//   Ben    = 5 + 5 + 5  = 15, exactCount=0, outcomeCount=0
//   Bea    = 14         = 14, exactCount=1, outcomeCount=1
const SCORES = [
  // Alice
  score("uA1", 12, true,  true),
  score("uA1",  7, false, true),
  score("uA1",  3, false, true),
  // Andrew
  score("uA2", 12, true,  true),
  score("uA2",  7, false, true),
  // Anya
  score("uA3",  7, false, true),
  score("uA3",  3, false, true),
  // Ben (all advancement-only +5 doubled? doesn't matter for the test)
  score("uB1",  5),
  score("uB1",  5),
  score("uB1",  5),
  // Bea
  score("uB2", 14, true,  true),
];

// ---------- Mongoose .lean() / .select() mock chains ----------

function leanReturn<T>(rows: T) {
  return {
    select: () => ({ lean: () => Promise.resolve(rows) }),
    lean:   () => Promise.resolve(rows),
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
}

beforeEach(() => {
  vi.mocked(User.find).mockReset();
  vi.mocked(Score.find).mockReset();
  vi.mocked(Company.find).mockReset();
  vi.mocked(Prediction.find).mockReset();
  // Default: no predictions (so existing tests without submission-time
  // fixtures still resolve cleanly to "no finalisation time for anyone").
  vi.mocked(Prediction.find).mockReturnValue(leanReturn([]) as never);
});

// ---------- /leaderboard/company ----------

describe("GET /leaderboard/company", () => {
  it("401 when JWT carries no companyId", async () => {
    const res = makeRes();
    await getCompanyLeaderboard({ userId: "uA1" } as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it("returns rows only for the caller's company (Company A view)", async () => {
    // User.find called with { companyId: CO_A } → only A users
    vi.mocked(User.find).mockImplementation((q: unknown) => {
      const query = q as { companyId?: string };
      const rows = USERS.filter((u) => u.companyId === query.companyId);
      return leanReturn(rows) as never;
    });
    // Score.find returns ALL scores; the service drops those whose userId
    // isn't in the in-scope user list.
    vi.mocked(Score.find).mockReturnValue(leanReturn(SCORES) as never);

    const res = makeRes();
    await getCompanyLeaderboard(
      { userId: "uA1", companyId: CO_A } as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { leaderboard: Array<{ name: string; userId: string }> };
    expect(body.leaderboard.length).toBe(3);
    const names = body.leaderboard.map((r) => r.name);
    expect(names).toEqual(["Alice", "Andrew", "Anya"]);
    // Critical: no B users leaked through.
    for (const r of body.leaderboard) {
      expect(["uA1", "uA2", "uA3"]).toContain(r.userId);
    }
  });

  it("SECURITY: ignores companyId supplied in body/query/params — uses JWT only", async () => {
    // The caller is authenticated as Company B but tries to read Company A.
    // The User.find query MUST be { companyId: CO_B } regardless of body.
    let capturedQuery: { companyId?: string } | undefined;
    vi.mocked(User.find).mockImplementation((q: unknown) => {
      capturedQuery = q as { companyId?: string };
      const rows = USERS.filter((u) => u.companyId === capturedQuery!.companyId);
      return leanReturn(rows) as never;
    });
    vi.mocked(Score.find).mockReturnValue(leanReturn(SCORES) as never);

    const res = makeRes();
    await getCompanyLeaderboard(
      {
        userId: "uB1",
        companyId: CO_B,             // ← from JWT
        body:   { companyId: CO_A }, // ← attacker injects
        query:  { companyId: CO_A },
        params: { companyId: CO_A },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(capturedQuery).toEqual({ companyId: CO_B });
    const body = res.body as { leaderboard: Array<{ userId: string; name: string }> };
    // Only B users.
    expect(body.leaderboard.map((r) => r.userId).sort()).toEqual(["uB1", "uB2"]);
    // Definitely no A user names.
    const names = body.leaderboard.map((r) => r.name);
    expect(names).not.toContain("Alice");
    expect(names).not.toContain("Andrew");
    expect(names).not.toContain("Anya");
  });

  it("aggregates points correctly from Score rows (Alice=22, Andrew=19, Anya=10)", async () => {
    vi.mocked(User.find).mockImplementation((q: unknown) => {
      const query = q as { companyId?: string };
      return leanReturn(USERS.filter((u) => u.companyId === query.companyId)) as never;
    });
    vi.mocked(Score.find).mockReturnValue(leanReturn(SCORES) as never);

    const res = makeRes();
    await getCompanyLeaderboard({ userId: "uA1", companyId: CO_A } as never, res as never);

    const body = res.body as {
      leaderboard: Array<{
        name: string; points: number; exactCount: number; outcomeCount: number;
      }>;
    };
    const byName = Object.fromEntries(body.leaderboard.map((r) => [r.name, r]));
    expect(byName.Alice ).toMatchObject({ points: 22, exactCount: 1, outcomeCount: 3 });
    expect(byName.Andrew).toMatchObject({ points: 19, exactCount: 1, outcomeCount: 2 });
    expect(byName.Anya  ).toMatchObject({ points: 10, exactCount: 0, outcomeCount: 2 });
  });

  it("includes users with zero Score rows at 0 points", async () => {
    vi.mocked(User.find).mockImplementation((q: unknown) => {
      const query = q as { companyId?: string };
      return leanReturn(USERS.filter((u) => u.companyId === query.companyId)) as never;
    });
    // No scores at all.
    vi.mocked(Score.find).mockReturnValue(leanReturn([]) as never);

    const res = makeRes();
    await getCompanyLeaderboard({ userId: "uA1", companyId: CO_A } as never, res as never);

    const body = res.body as { leaderboard: Array<{ name: string; points: number; rank: number }> };
    expect(body.leaderboard.length).toBe(3);
    for (const r of body.leaderboard) {
      expect(r.points).toBe(0);
    }
    // Sequential ranks even when all tied at 0.
    expect(body.leaderboard.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("sort: points desc → exactCount desc → outcomeCount desc; sequential ranks across ties", async () => {
    vi.mocked(User.find).mockImplementation((q: unknown) => {
      const query = q as { companyId?: string };
      return leanReturn(USERS.filter((u) => u.companyId === query.companyId)) as never;
    });
    vi.mocked(Score.find).mockReturnValue(leanReturn(SCORES) as never);

    const res = makeRes();
    await getCompanyLeaderboard({ userId: "uA1", companyId: CO_A } as never, res as never);

    const body = res.body as {
      leaderboard: Array<{ name: string; rank: number; points: number }>;
    };
    expect(body.leaderboard.map((r) => r.name)).toEqual(["Alice", "Andrew", "Anya"]);
    expect(body.leaderboard.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("sort tiebreaker: equal points → exactCount wins; equal both → outcomeCount wins; equal all three → sequential ranks", async () => {
    // Two A-company users tied at 10 points but different exactCount.
    const tieUsers = [
      { _id: "t1", name: "T1", companyId: CO_A },
      { _id: "t2", name: "T2", companyId: CO_A },
      { _id: "t3", name: "T3", companyId: CO_A },
      { _id: "t4", name: "T4", companyId: CO_A }, // fully tied with t3
    ];
    const tieScores = [
      // t1: 10 points, 0 exact, 2 outcome
      { userId: "t1", points: 5, exact: false, outcome: true,  gd: false, advancement: false, matchId: 1 },
      { userId: "t1", points: 5, exact: false, outcome: true,  gd: false, advancement: false, matchId: 2 },
      // t2: 10 points, 1 exact, 1 outcome  → beats t1 on exactCount
      { userId: "t2", points: 5, exact: true,  outcome: true,  gd: true,  advancement: false, matchId: 1 },
      { userId: "t2", points: 5, exact: false, outcome: false, gd: false, advancement: false, matchId: 2 },
      // t3 / t4: identical 10 / 0 / 1  → must remain in stable order via sequential ranks
      { userId: "t3", points: 5, exact: false, outcome: true,  gd: false, advancement: false, matchId: 1 },
      { userId: "t3", points: 5, exact: false, outcome: false, gd: false, advancement: false, matchId: 2 },
      { userId: "t4", points: 5, exact: false, outcome: true,  gd: false, advancement: false, matchId: 1 },
      { userId: "t4", points: 5, exact: false, outcome: false, gd: false, advancement: false, matchId: 2 },
    ];
    vi.mocked(User.find).mockReturnValue(leanReturn(tieUsers) as never);
    vi.mocked(Score.find).mockReturnValue(leanReturn(tieScores) as never);

    const res = makeRes();
    await getCompanyLeaderboard({ userId: "t1", companyId: CO_A } as never, res as never);

    const body = res.body as {
      leaderboard: Array<{ name: string; rank: number; exactCount: number; outcomeCount: number }>;
    };

    // t2 first (exactCount=1 wins over outcomeCount tiebreaker).
    expect(body.leaderboard[0].name).toBe("T2");
    expect(body.leaderboard[0].rank).toBe(1);

    // t1 second (more outcomeCount than t3/t4).
    expect(body.leaderboard[1].name).toBe("T1");
    expect(body.leaderboard[1].rank).toBe(2);

    // t3 and t4 fully tied → ranks 3 and 4 (sequential, NOT both 3).
    const tail = body.leaderboard.slice(2).map((r) => ({ name: r.name, rank: r.rank }));
    expect(tail).toEqual([
      { name: "T3", rank: 3 },
      { name: "T4", rank: 4 },
    ]);
  });

  it("final tiebreaker: equal points/exact/outcome → earlier finalisation time ranks higher", async () => {
    // Two users with IDENTICAL stats. Only difference: e1's latest
    // prediction was submitted earlier than e2's.
    const users = [
      { _id: "e1", name: "Early",  companyId: CO_A },
      { _id: "e2", name: "Latter", companyId: CO_A },
    ];
    const scores = [
      // Both: 8 points, 0 exact, 2 outcome → tied on every prior key.
      { userId: "e1", points: 4, exact: false, outcome: true, gd: false, advancement: false, matchId: 1 },
      { userId: "e1", points: 4, exact: false, outcome: true, gd: false, advancement: false, matchId: 2 },
      { userId: "e2", points: 4, exact: false, outcome: true, gd: false, advancement: false, matchId: 1 },
      { userId: "e2", points: 4, exact: false, outcome: true, gd: false, advancement: false, matchId: 2 },
    ];
    // e1 finalised on June 1; e2 was still editing on June 5. e1 wins.
    const predictions = [
      { userId: "e1", submittedAt: new Date("2026-05-20T10:00:00Z") },
      { userId: "e1", submittedAt: new Date("2026-06-01T09:00:00Z") }, // e1 max
      { userId: "e2", submittedAt: new Date("2026-05-20T10:00:00Z") },
      { userId: "e2", submittedAt: new Date("2026-06-05T23:30:00Z") }, // e2 max — later
    ];

    vi.mocked(User.find).mockReturnValue(leanReturn(users) as never);
    vi.mocked(Score.find).mockReturnValue(leanReturn(scores) as never);
    vi.mocked(Prediction.find).mockReturnValue(leanReturn(predictions) as never);

    const res = makeRes();
    await getCompanyLeaderboard({ userId: "e1", companyId: CO_A } as never, res as never);

    const body = res.body as {
      leaderboard: Array<{ name: string; rank: number; points: number }>;
    };
    expect(body.leaderboard.map((r) => r.name)).toEqual(["Early", "Latter"]);
    expect(body.leaderboard[0]).toMatchObject({ name: "Early",  rank: 1, points: 8 });
    expect(body.leaderboard[1]).toMatchObject({ name: "Latter", rank: 2, points: 8 });
  });

  it("final tiebreaker: a user with NO predictions sorts after a user who does, when otherwise tied", async () => {
    // Both at 0 points (no Score rows). One has predictions (submitted),
    // one never submitted anything. The submitter ranks higher.
    const users = [
      { _id: "s1", name: "Submitter", companyId: CO_A },
      { _id: "n1", name: "NoPicks",   companyId: CO_A },
    ];
    const predictions = [
      { userId: "s1", submittedAt: new Date("2026-05-30T12:00:00Z") },
    ];

    vi.mocked(User.find).mockReturnValue(leanReturn(users) as never);
    vi.mocked(Score.find).mockReturnValue(leanReturn([]) as never);
    vi.mocked(Prediction.find).mockReturnValue(leanReturn(predictions) as never);

    const res = makeRes();
    await getCompanyLeaderboard({ userId: "s1", companyId: CO_A } as never, res as never);

    const body = res.body as { leaderboard: Array<{ name: string; rank: number }> };
    expect(body.leaderboard.map((r) => r.name)).toEqual(["Submitter", "NoPicks"]);
    expect(body.leaderboard.map((r) => r.rank)).toEqual([1, 2]);
  });
});

// ---------- /leaderboard/overall ----------

describe("GET /leaderboard/overall", () => {
  it("401 when JWT is missing", async () => {
    const res = makeRes();
    await getOverallLeaderboard({} as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it("returns ALL users across companies, each with companyName", async () => {
    vi.mocked(User.find).mockReturnValue(leanReturn(USERS) as never);
    vi.mocked(Score.find).mockReturnValue(leanReturn(SCORES) as never);
    vi.mocked(Company.find).mockReturnValue(leanReturn(COMPANIES) as never);

    const res = makeRes();
    await getOverallLeaderboard({ userId: "uA1", companyId: CO_A } as never, res as never);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      leaderboard: Array<{ name: string; companyName: string }>;
    };
    expect(body.leaderboard.length).toBe(5);
    const names = body.leaderboard.map((r) => r.name).sort();
    expect(names).toEqual(["Alice", "Andrew", "Anya", "Bea", "Ben"]);
    for (const r of body.leaderboard) {
      expect(r.companyName).toBeDefined();
      expect(r.companyName.length).toBeGreaterThan(0);
    }
    // Specific mapping.
    const byName = Object.fromEntries(body.leaderboard.map((r) => [r.name, r.companyName]));
    expect(byName.Alice).toBe("Tigress");
    expect(byName.Ben  ).toBe("Beta");
  });

  it("sort: full ordering across companies (Alice 22, Andrew 19, Ben 15, Bea 14, Anya 10)", async () => {
    vi.mocked(User.find).mockReturnValue(leanReturn(USERS) as never);
    vi.mocked(Score.find).mockReturnValue(leanReturn(SCORES) as never);
    vi.mocked(Company.find).mockReturnValue(leanReturn(COMPANIES) as never);

    const res = makeRes();
    await getOverallLeaderboard({ userId: "uA1", companyId: CO_A } as never, res as never);

    const body = res.body as {
      leaderboard: Array<{ name: string; points: number; rank: number; companyName: string }>;
    };
    expect(body.leaderboard.map((r) => r.name)).toEqual([
      "Alice", "Andrew", "Ben", "Bea", "Anya",
    ]);
    expect(body.leaderboard.map((r) => r.points)).toEqual([22, 19, 15, 14, 10]);
    expect(body.leaderboard.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("aggregates points from Score rows verbatim — does not recompute", async () => {
    // Construct intentionally-wrong Score rows (e.g. a points value that
    // wouldn't be produced by the cumulative scorer). The leaderboard must
    // STILL surface whatever is stored — proves we're summing, not scoring.
    const fakeUsers  = [{ _id: "uX", name: "X", companyId: CO_A }];
    const fakeScores = [
      { userId: "uX", matchId: 1, points: 999, exact: true,  gd: true,  outcome: true,  advancement: false },
      { userId: "uX", matchId: 2, points:  -5, exact: false, gd: false, outcome: false, advancement: false },
    ];
    vi.mocked(User.find).mockReturnValue(leanReturn(fakeUsers) as never);
    vi.mocked(Score.find).mockReturnValue(leanReturn(fakeScores) as never);
    vi.mocked(Company.find).mockReturnValue(leanReturn(COMPANIES) as never);

    const res = makeRes();
    await getOverallLeaderboard({ userId: "uX", companyId: CO_A } as never, res as never);

    const body = res.body as { leaderboard: Array<{ points: number; exactCount: number }> };
    expect(body.leaderboard[0].points    ).toBe(999 + -5); // 994 — summed verbatim
    expect(body.leaderboard[0].exactCount).toBe(1);
  });
});
