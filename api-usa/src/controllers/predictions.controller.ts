import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Match } from "../models/Match";
import { Team } from "../models/team";
import { Prediction } from "../models/Prediction";
import { SUBMISSION_DEADLINE_UTC } from "../config/deadline";
import {
  validateBracketSubmission,
  type GroupPredInput,
  type KnockoutPredInput,
  type TeamInput,
  type GroupMatchMeta,
} from "../services/bracketValidator";

/**
 * Up-front bracket prediction controller.
 *
 *   PUT /predictions/bracket   (auth)  submit/replace full bracket
 *   GET /predictions/bracket   (auth)  read current bracket
 *   GET /predictions/me        (auth)  raw rows (debug / admin tooling)
 *   POST /predictions          (auth)  410 Gone — replaced by PUT /bracket
 *
 * Invariants enforced server-side:
 *
 * 1) Single tournament-wide deadline.
 *    The bracket is editable up to SUBMISSION_DEADLINE_UTC; after, 403
 *    Submissions closed. There is no per-match lock and no Lock-of-the-Day.
 *    Resubmits overwrite-in-place (one row per (userId, matchId) via upsert);
 *    the LATEST submit before the deadline is the one that counts.
 *
 * 2) Internal-consistency cascade.
 *    Every knockout pick must be one of the two teams the user's OWN
 *    predicted standings + earlier KO picks place in that slot. Validation
 *    runs slot-by-slot via the same resolveBracket used elsewhere.
 *
 * 3) All-or-nothing write.
 *    The 104 rows are written in one bulk operation; a validation error
 *    returns 400 with the offending slot(s) and writes nothing.
 *
 * companyId is read from the JWT (req.companyId), never the body.
 */

// ---------- PUT /predictions/bracket ----------

interface PutBracketBody {
  groups?: GroupPredInput[];
  knockouts?: KnockoutPredInput[];
}

export async function putBracket(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  const body = (req.body ?? {}) as PutBracketBody;
  const groups = Array.isArray(body.groups) ? body.groups : null;
  const knockouts = Array.isArray(body.knockouts) ? body.knockouts : null;
  if (!groups || !knockouts) {
    res.status(400).json({ error: "Body must include `groups` (array) and `knockouts` (array)" });
    return;
  }

  // ---- (1) Single tournament-wide deadline ----
  // Server time only — never trust a client-sent timestamp here.
  // Deadline boundary is the close: T === deadline is rejected.
  if (Date.now() >= SUBMISSION_DEADLINE_UTC.getTime()) {
    res.status(403).json({
      error: "Submissions closed",
      deadline: SUBMISSION_DEADLINE_UTC.toISOString(),
    });
    return;
  }

  // ---- (2) Load fixture + team metadata ----
  const [teamsRaw, groupMatchesRaw] = await Promise.all([
    Team.find({}).select({ id: 1, group: 1, seed: 1 }).lean(),
    Match.find({ type: "group" })
      .select({ id: 1, group: 1, homeTeamId: 1, awayTeamId: 1 })
      .lean(),
  ]);

  const teams: TeamInput[] = (teamsRaw as Array<{ id: string; group: string; seed: number }>).map(
    (t) => ({ id: t.id, group: t.group, seed: t.seed }),
  );
  const groupMatches: GroupMatchMeta[] = (groupMatchesRaw as Array<{
    id: number; group: string; homeTeamId: string; awayTeamId: string;
  }>).map((m) => ({ id: m.id, group: m.group, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId }));

  if (teams.length === 0 || groupMatches.length === 0) {
    res.status(500).json({ error: "Tournament not seeded; run npm run seed:tournament." });
    return;
  }

  // ---- (3) Cascade validation ----
  const result = validateBracketSubmission(groups, knockouts, teams, groupMatches);
  if (!result.ok) {
    res.status(400).json({ error: "Bracket validation failed", details: result.errors });
    return;
  }

  // ---- (4) All-or-nothing write ----
  const now = new Date();
  const ops: Array<{
    updateOne: {
      filter: { userId: string; matchId: number };
      update: {
        $set: {
          homeScorePred: number;
          awayScorePred: number;
          winnerPickTeamId: string | null;
          predHomeTeamId: string | null;
          predAwayTeamId: string | null;
          submittedAt: Date;
        };
      };
      upsert: true;
    };
  }> = [];

  for (const g of groups) {
    ops.push({
      updateOne: {
        filter: { userId, matchId: g.matchId },
        update: {
          $set: {
            homeScorePred: g.homeScorePred,
            awayScorePred: g.awayScorePred,
            winnerPickTeamId: null,
            predHomeTeamId: null,
            predAwayTeamId: null,
            submittedAt: now,
          },
        },
        upsert: true,
      },
    });
  }
  for (const k of knockouts) {
    const derived = result.derivedSlots.get(k.matchId)!;
    ops.push({
      updateOne: {
        filter: { userId, matchId: k.matchId },
        update: {
          $set: {
            homeScorePred: k.homeScorePred,
            awayScorePred: k.awayScorePred,
            winnerPickTeamId: k.winnerPickTeamId,
            predHomeTeamId: derived.homeTeamId,
            predAwayTeamId: derived.awayTeamId,
            submittedAt: now,
          },
        },
        upsert: true,
      },
    });
  }

  // All-or-nothing write via a Mongo transaction. If ANY upsert fails, the
  // whole bracket aborts and the user's prior state (if any) is unchanged —
  // there is no partial bracket on disk. Requires a replica-set / Atlas
  // deployment (single-node mongod without replSet does not support
  // transactions). bulkWrite's Mongoose-inferred type is overly strict
  // about ObjectId fields and required-with-default fields; cast at the
  // call boundary. `ordered: true` so the transaction aborts on the first
  // error rather than continuing and burning the rest of the ops list.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Prediction.bulkWrite(ops as never, { ordered: true, session });
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to write bracket; transaction aborted, no partial state written.",
      details: (err as Error).message,
    });
    return;
  } finally {
    await session.endSession();
  }

  res.status(200).json({
    submittedAt: now.toISOString(),
    groups: groups.length,
    knockouts: knockouts.length,
    lockedAt: SUBMISSION_DEADLINE_UTC.toISOString(),
  });
}

// ---------- GET /predictions/bracket ----------

export async function getBracket(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  const rows = await Prediction.find({ userId }).lean();
  const groups: Array<{ matchId: number; homeScorePred: number | null; awayScorePred: number | null }> = [];
  const knockouts: Array<{
    matchId: number;
    homeScorePred: number | null;
    awayScorePred: number | null;
    winnerPickTeamId: string | null;
    predHomeTeamId: string | null;
    predAwayTeamId: string | null;
  }> = [];

  for (const r of rows as Array<Record<string, unknown>>) {
    const matchId = r.matchId as number;
    if (matchId >= 73) {
      knockouts.push({
        matchId,
        homeScorePred:    (r.homeScorePred as number | null) ?? null,
        awayScorePred:    (r.awayScorePred as number | null) ?? null,
        winnerPickTeamId: (r.winnerPickTeamId as string | null) ?? null,
        predHomeTeamId:   (r.predHomeTeamId as string | null) ?? null,
        predAwayTeamId:   (r.predAwayTeamId as string | null) ?? null,
      });
    } else {
      groups.push({
        matchId,
        homeScorePred: (r.homeScorePred as number | null) ?? null,
        awayScorePred: (r.awayScorePred as number | null) ?? null,
      });
    }
  }
  groups.sort((a, b) => a.matchId - b.matchId);
  knockouts.sort((a, b) => a.matchId - b.matchId);

  // Pull submittedAt from any row (they're all written together).
  const submittedAt = rows.length > 0
    ? ((rows[0] as { submittedAt?: Date | string }).submittedAt as Date | string | undefined)
    : undefined;

  res.status(200).json({
    groups,
    knockouts,
    submittedAt: submittedAt ? new Date(submittedAt).toISOString() : null,
    lockedAt: SUBMISSION_DEADLINE_UTC.toISOString(),
    locked: Date.now() >= SUBMISSION_DEADLINE_UTC.getTime(),
  });
}

// ---------- Legacy per-match POST → 410 ----------

export async function submitPrediction(_req: Request, res: Response): Promise<void> {
  res.status(410).json({
    error: "POST /predictions has been removed. Use PUT /predictions/bracket to submit your full bracket.",
  });
}

// ---------- GET /predictions/me (raw rows) ----------

export async function getMyPredictions(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  const predictions = await Prediction.find({ userId }).lean();
  res.status(200).json({ predictions });
}
