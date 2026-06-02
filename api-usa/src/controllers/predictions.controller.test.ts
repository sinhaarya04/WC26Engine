/**
 * Tests for the up-front bracket predictions controller.
 *
 *   PUT /predictions/bracket   submit the full bracket
 *   GET /predictions/bracket   read the user's bracket (structured)
 *   GET /predictions/me        raw rows
 *   POST /predictions          410 Gone
 *
 * Mocks: Match, Team, Prediction models + the cascade validator. The
 * deadline check uses the SUBMISSION_DEADLINE_UTC constant directly; tests
 * drive it via vi.setSystemTime, not a mock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../models/Match", () => ({
  Match: { find: vi.fn() },
}));
vi.mock("../models/team", () => ({
  Team: { find: vi.fn() },
}));
vi.mock("../models/Prediction", () => ({
  Prediction: { bulkWrite: vi.fn(), find: vi.fn() },
}));
vi.mock("../services/bracketValidator", () => ({
  validateBracketSubmission: vi.fn(),
}));
// Mock mongoose.startSession so tests can drive transactional behaviour
// without a live replica set. Default session (set per-test) just runs the
// callback verbatim.
vi.mock("mongoose", () => {
  const startSession = vi.fn();
  return { default: { startSession }, startSession };
});

import mongoose from "mongoose";
import { Match } from "../models/Match";
import { Team } from "../models/team";
import { Prediction } from "../models/Prediction";
import { SUBMISSION_DEADLINE_UTC } from "../config/deadline";
import { validateBracketSubmission } from "../services/bracketValidator";
import {
  putBracket,
  getBracket,
  getMyPredictions,
  submitPrediction,
} from "./predictions.controller";

// ---------- Helpers ----------

function makeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(p: unknown) { this.body = p; return this; },
    send(p: unknown) { this.body = p; return this; },
  };
}

function mockSelectLean<T>(value: T) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}
function mockLean<T>(value: T) {
  return { lean: () => Promise.resolve(value) };
}

const USER_ID = "user-1";
const NOW = new Date("2026-06-01T00:00:00Z");
// Alias for readability — tests pivot off the real deadline constant.
const LOCK = SUBMISSION_DEADLINE_UTC;

// Minimal "valid-looking" body — the controller forwards everything to the
// (mocked) validator, so shape is what matters.
const GROUPS = Array.from({ length: 72 }, (_, i) => ({
  matchId: i + 1, homeScorePred: 1, awayScorePred: 0,
}));
const KNOCKOUTS = Array.from({ length: 32 }, (_, i) => ({
  matchId: 73 + i, homeScorePred: 1, awayScorePred: 0, winnerPickTeamId: `T${i}`,
}));

const TEAMS_LEAN = [{ id: "T0", group: "A", seed: 1 }];
const GROUP_MATCHES_LEAN = [{ id: 1, group: "A", homeTeamId: "T0", awayTeamId: "T1" }];

const DERIVED_SLOTS = new Map<number, { homeTeamId: string; awayTeamId: string }>(
  KNOCKOUTS.map((k) => [k.matchId, { homeTeamId: `H${k.matchId}`, awayTeamId: `A${k.matchId}` }]),
);

// Reusable session stub: withTransaction just runs the callback (and
// re-throws on failure, mirroring real Mongoose behaviour). endSession is
// a no-op. Per-test we capture both spies on the SAME object instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sessionSpies: { withTransaction: any; endSession: any };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);

  vi.mocked(Match.find).mockReset();
  vi.mocked(Team.find).mockReset();
  vi.mocked(Prediction.bulkWrite).mockReset();
  vi.mocked(Prediction.find).mockReset();
  vi.mocked(validateBracketSubmission).mockReset();
  vi.mocked(mongoose.startSession).mockReset();

  // Defaults: NOW < deadline, fixtures present, validator passes,
  // bulkWrite succeeds, transaction wrapper runs the callback inline.
  vi.mocked(Team.find).mockReturnValue(mockSelectLean(TEAMS_LEAN) as never);
  vi.mocked(Match.find).mockReturnValue(mockSelectLean(GROUP_MATCHES_LEAN) as never);
  vi.mocked(validateBracketSubmission).mockReturnValue({
    ok: true, derivedSlots: DERIVED_SLOTS,
  } as never);
  vi.mocked(Prediction.bulkWrite).mockResolvedValue({} as never);

  sessionSpies = {
    withTransaction: vi.fn(async (cb: () => Promise<unknown>) => cb()),
    endSession: vi.fn(async () => {}),
  };
  vi.mocked(mongoose.startSession).mockResolvedValue(sessionSpies as never);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------- PUT /predictions/bracket ----------

describe("PUT /predictions/bracket — auth + body shape", () => {
  it("401 without req.userId", async () => {
    const res = makeRes();
    await putBracket({ body: {} } as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it("400 when body is missing groups or knockouts", async () => {
    for (const body of [
      {},
      { groups: GROUPS },
      { knockouts: KNOCKOUTS },
      { groups: "nope", knockouts: KNOCKOUTS },
    ] as Array<Record<string, unknown>>) {
      const res = makeRes();
      await putBracket({ userId: USER_ID, body } as never, res as never);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
  });
});

describe("PUT /predictions/bracket — SUBMISSION_DEADLINE_UTC", () => {
  // (b) submit at T+1s returns 403
  it("403 with {error,deadline} when now > deadline (T+1s)", async () => {
    vi.setSystemTime(new Date(LOCK.getTime() + 1000));
    const res = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: GROUPS, knockouts: KNOCKOUTS } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(403);
    const body = res.body as { error: string; deadline: string };
    expect(body.error).toBe("Submissions closed");
    expect(body.deadline).toBe(LOCK.toISOString());
    expect(vi.mocked(Prediction.bulkWrite)).not.toHaveBeenCalled();
  });

  // Boundary: T === deadline must also reject — the deadline is the close.
  it("403 exactly AT the deadline (boundary is the close)", async () => {
    vi.setSystemTime(LOCK);
    const res = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: GROUPS, knockouts: KNOCKOUTS } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(403);
    expect(vi.mocked(Prediction.bulkWrite)).not.toHaveBeenCalled();
  });

  // (a) submit at T-1s succeeds AND overwrites a prior bracket (upsert-in-place)
  it("T-1s: submit succeeds AND overwrites a prior bracket (upsert)", async () => {
    vi.setSystemTime(new Date(LOCK.getTime() - 1000));

    // First submit (prior bracket).
    const firstGroups = GROUPS.map((g) => ({ ...g, homeScorePred: 1, awayScorePred: 0 }));
    const firstRes = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: firstGroups, knockouts: KNOCKOUTS } } as never,
      firstRes as never,
    );
    expect(firstRes.statusCode).toBe(200);

    // Second submit (overwrite) — still T-1s.
    const secondGroups = GROUPS.map((g) => ({ ...g, homeScorePred: 3, awayScorePred: 2 }));
    const secondRes = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: secondGroups, knockouts: KNOCKOUTS } } as never,
      secondRes as never,
    );
    expect(secondRes.statusCode).toBe(200);

    // bulkWrite called twice; every op is an upsert keyed on (userId, matchId)
    // — i.e. overwrite-in-place, not a history append.
    expect(vi.mocked(Prediction.bulkWrite)).toHaveBeenCalledTimes(2);
    const secondOps = vi.mocked(Prediction.bulkWrite).mock.calls[1][0] as Array<{
      updateOne: {
        filter: { userId: string; matchId: number };
        update: { $set: { homeScorePred: number; awayScorePred: number } };
        upsert: boolean;
      };
    }>;
    for (const op of secondOps.slice(0, 72)) {
      expect(op.updateOne.upsert).toBe(true);
      expect(op.updateOne.filter.userId).toBe(USER_ID);
      // The second submit's values are what land — proves the latest wins.
      expect(op.updateOne.update.$set.homeScorePred).toBe(3);
      expect(op.updateOne.update.$set.awayScorePred).toBe(2);
    }
  });

  // (c) two submits before deadline → only the second persists
  it("two submits before deadline: second submit's payload is the one written", async () => {
    vi.setSystemTime(new Date(LOCK.getTime() - 60_000));

    const groupsA = GROUPS.map((g) => ({ ...g, homeScorePred: 0, awayScorePred: 0 }));
    const groupsB = GROUPS.map((g) => ({ ...g, homeScorePred: 4, awayScorePred: 1 }));

    const r1 = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: groupsA, knockouts: KNOCKOUTS } } as never,
      r1 as never,
    );
    expect(r1.statusCode).toBe(200);

    const r2 = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: groupsB, knockouts: KNOCKOUTS } } as never,
      r2 as never,
    );
    expect(r2.statusCode).toBe(200);

    // The second call's ops must reflect groupsB values (not groupsA).
    expect(vi.mocked(Prediction.bulkWrite)).toHaveBeenCalledTimes(2);
    const secondOps = vi.mocked(Prediction.bulkWrite).mock.calls[1][0] as Array<{
      updateOne: { filter: { matchId: number }; update: { $set: { homeScorePred: number; awayScorePred: number } } };
    }>;
    const firstGroupOp = secondOps.find((o) => o.updateOne.filter.matchId === 1)!;
    expect(firstGroupOp.updateOne.update.$set.homeScorePred).toBe(4);
    expect(firstGroupOp.updateOne.update.$set.awayScorePred).toBe(1);
  });
});

describe("PUT /predictions/bracket — validator integration", () => {
  it("400 with details when validator rejects", async () => {
    vi.mocked(validateBracketSubmission).mockReturnValue({
      ok: false, errors: ["slot 73: winnerPickTeamId X is not one of the two teams"],
    } as never);

    const res = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: GROUPS, knockouts: KNOCKOUTS } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { details: string[] }).details[0]).toMatch(/slot 73/);
    expect(vi.mocked(Prediction.bulkWrite)).not.toHaveBeenCalled();
  });

  it("happy path: bulkWrites 104 upserts (72 group + 32 KO) and returns 200", async () => {
    const res = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: GROUPS, knockouts: KNOCKOUTS } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);

    expect(vi.mocked(Prediction.bulkWrite)).toHaveBeenCalledTimes(1);
    const ops = vi.mocked(Prediction.bulkWrite).mock.calls[0][0] as Array<{
      updateOne: {
        filter: { userId: string; matchId: number };
        update: { $set: Record<string, unknown> };
      };
    }>;
    expect(ops.length).toBe(104);

    // Group row: winnerPickTeamId / predHome/AwayTeamId stay null.
    const groupOp = ops.find((o) => o.updateOne.filter.matchId === 1)!;
    expect(groupOp.updateOne.filter).toEqual({ userId: USER_ID, matchId: 1 });
    expect(groupOp.updateOne.update.$set.winnerPickTeamId).toBeNull();
    expect(groupOp.updateOne.update.$set.predHomeTeamId).toBeNull();
    expect(groupOp.updateOne.update.$set.predAwayTeamId).toBeNull();
    expect(groupOp.updateOne.update.$set.homeScorePred).toBe(1);

    // KO row: carries derived home/away team ids from the validator.
    const koOp = ops.find((o) => o.updateOne.filter.matchId === 73)!;
    expect(koOp.updateOne.update.$set.winnerPickTeamId).toBe("T0");
    expect(koOp.updateOne.update.$set.predHomeTeamId).toBe("H73");
    expect(koOp.updateOne.update.$set.predAwayTeamId).toBe("A73");
  });

  it("happy path wraps the bulkWrite in a transaction (startSession + withTransaction + endSession)", async () => {
    const res = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: GROUPS, knockouts: KNOCKOUTS } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);

    expect(vi.mocked(mongoose.startSession)).toHaveBeenCalledTimes(1);
    expect(sessionSpies.withTransaction).toHaveBeenCalledTimes(1);
    expect(sessionSpies.endSession).toHaveBeenCalledTimes(1);

    // bulkWrite must receive the session — otherwise the write isn't part
    // of the transaction and "all-or-nothing" is a lie.
    const opts = vi.mocked(Prediction.bulkWrite).mock.calls[0][1] as {
      ordered: boolean; session: unknown;
    };
    expect(opts.session).toBe(sessionSpies);
    expect(opts.ordered).toBe(true);
  });

  it("mid-write failure aborts the transaction: 500 returned, NO partial bracket persists", async () => {
    // Simulate a per-row failure inside the bulkWrite (the closest analogue
    // to "wrote 50 of 104 then died"). With ordered:true + transaction, the
    // whole write must abort and roll back — nothing on disk.
    vi.mocked(Prediction.bulkWrite).mockRejectedValue(
      new Error("E11000 duplicate key during op 51"),
    );

    const res = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: GROUPS, knockouts: KNOCKOUTS } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(500);
    const body = res.body as { error: string; details: string };
    expect(body.error).toMatch(/transaction aborted, no partial state written/);
    expect(body.details).toMatch(/duplicate key/);

    // The session must still be cleaned up even on failure.
    expect(sessionSpies.endSession).toHaveBeenCalledTimes(1);

    // bulkWrite was attempted exactly once (inside the transaction); we
    // never retried, never wrote anything outside it.
    expect(vi.mocked(Prediction.bulkWrite)).toHaveBeenCalledTimes(1);

    // No other write surface was touched as a fallback.
    expect(vi.mocked(Prediction.find)).not.toHaveBeenCalled();
  });

  it("ends the session even when the transaction wrapper itself throws", async () => {
    // E.g. an underlying MongoServerError from the txn coordinator.
    sessionSpies.withTransaction.mockRejectedValue(new Error("TransientTransactionError: retries exhausted"));

    const res = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: GROUPS, knockouts: KNOCKOUTS } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(500);
    expect(sessionSpies.endSession).toHaveBeenCalledTimes(1);
  });

  it("companyId from the JWT is NEVER consulted by the body (read-only here)", async () => {
    // The submit handler doesn't filter by companyId; verifies absence of any
    // such read by checking that a body-supplied companyId is ignored.
    const res = makeRes();
    await putBracket(
      {
        userId: USER_ID,
        companyId: "from-jwt",
        body: { groups: GROUPS, knockouts: KNOCKOUTS, companyId: "from-body" },
      } as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    const ops = vi.mocked(Prediction.bulkWrite).mock.calls[0][0] as Array<{
      updateOne: { filter: Record<string, unknown>; update: { $set: Record<string, unknown> } };
    }>;
    for (const op of ops) {
      expect(op.updateOne.update.$set.companyId).toBeUndefined();
    }
  });

  it("500 when fixtures are empty", async () => {
    vi.mocked(Team.find).mockReturnValue(mockSelectLean([]) as never);
    const res = makeRes();
    await putBracket(
      { userId: USER_ID, body: { groups: GROUPS, knockouts: KNOCKOUTS } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(500);
  });
});

// ---------- GET /predictions/bracket ----------

describe("GET /predictions/bracket", () => {
  it("401 without req.userId", async () => {
    const res = makeRes();
    await getBracket({} as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it("returns structured groups + knockouts arrays for the user", async () => {
    const submittedAt = new Date("2026-06-09T10:00:00Z");
    const rows = [
      { userId: USER_ID, matchId: 1, homeScorePred: 2, awayScorePred: 1, winnerPickTeamId: null,
        predHomeTeamId: null, predAwayTeamId: null, submittedAt },
      { userId: USER_ID, matchId: 73, homeScorePred: 0, awayScorePred: 3, winnerPickTeamId: "T0",
        predHomeTeamId: "H73", predAwayTeamId: "A73", submittedAt },
    ];
    vi.mocked(Prediction.find).mockReturnValue(mockLean(rows) as never);

    const res = makeRes();
    await getBracket({ userId: USER_ID } as never, res as never);
    expect(res.statusCode).toBe(200);

    const body = res.body as {
      groups: Array<{ matchId: number }>;
      knockouts: Array<{ matchId: number; winnerPickTeamId: string | null }>;
      submittedAt: string;
      lockedAt: string;
      locked: boolean;
    };
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].matchId).toBe(1);
    expect(body.knockouts).toHaveLength(1);
    expect(body.knockouts[0].matchId).toBe(73);
    expect(body.knockouts[0].winnerPickTeamId).toBe("T0");
    expect(body.submittedAt).toBe(submittedAt.toISOString());
    expect(body.lockedAt).toBe(LOCK.toISOString());
    expect(body.locked).toBe(false);
    expect(vi.mocked(Prediction.find)).toHaveBeenCalledWith({ userId: USER_ID });
  });

  it("returns empty arrays + locked=true after the deadline", async () => {
    vi.setSystemTime(new Date(LOCK.getTime() + 1));
    vi.mocked(Prediction.find).mockReturnValue(mockLean([]) as never);
    const res = makeRes();
    await getBracket({ userId: USER_ID } as never, res as never);
    expect(res.statusCode).toBe(200);
    const body = res.body as { locked: boolean; groups: unknown[]; knockouts: unknown[]; submittedAt: string | null };
    expect(body.locked).toBe(true);
    expect(body.groups).toEqual([]);
    expect(body.knockouts).toEqual([]);
    expect(body.submittedAt).toBeNull();
  });
});

// ---------- Legacy + raw rows ----------

describe("POST /predictions (legacy) → 410 Gone", () => {
  it("returns 410 with a pointer to the new endpoint", async () => {
    const res = makeRes();
    await submitPrediction({ userId: USER_ID, body: {} } as never, res as never);
    expect(res.statusCode).toBe(410);
    expect((res.body as { error: string }).error).toMatch(/PUT \/predictions\/bracket/);
  });
});

describe("GET /predictions/me — raw rows", () => {
  it("401 without req.userId", async () => {
    const res = makeRes();
    await getMyPredictions({} as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it("returns only this user's predictions", async () => {
    const mine = [{ userId: USER_ID, matchId: 1, homeScorePred: 1, awayScorePred: 0 }];
    vi.mocked(Prediction.find).mockReturnValue(mockLean(mine) as never);

    const res = makeRes();
    await getMyPredictions({ userId: USER_ID } as never, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { predictions: unknown[] }).predictions).toEqual(mine);
    expect(vi.mocked(Prediction.find)).toHaveBeenCalledWith({ userId: USER_ID });
  });
});
