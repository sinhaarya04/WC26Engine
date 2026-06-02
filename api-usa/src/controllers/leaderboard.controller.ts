import type { Request, Response } from "express";
import { User } from "../models/user";
import { Score } from "../models/Score";
import { Company } from "../models/Company";
import { Prediction } from "../models/Prediction";
import {
  buildLeaderboard,
  type ScoreRow,
  type UserRow,
} from "../services/leaderboardService";

/**
 * Fold a flat list of `{userId, submittedAt}` rows into a map of
 * userId → MAX(submittedAt). This is the user's "finalisation time", the
 * fourth and final leaderboard tiebreaker (earlier wins).
 */
function buildSubmissionTimes(
  rows: Array<{ userId: unknown; submittedAt: unknown }>,
): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const r of rows) {
    const uid =
      typeof r.userId === "string"
        ? r.userId
        : r.userId == null
          ? ""
          : String(r.userId);
    if (!uid) continue;
    const t = r.submittedAt instanceof Date ? r.submittedAt : new Date(r.submittedAt as string);
    if (Number.isNaN(t.getTime())) continue;
    const cur = out.get(uid);
    if (!cur || t.getTime() > cur.getTime()) out.set(uid, t);
  }
  return out;
}

/**
 * GET /leaderboard/company — leaderboard for the requesting user's tenant.
 *
 * Returns rows only for users in the caller's company. companyId is read
 * STRICTLY from the JWT (set on req by requireAuth). Body / query / params
 * are NEVER consulted — supplying a different companyId in the request
 * leaks nothing because we ignore those fields entirely.
 */
export async function getCompanyLeaderboard(req: Request, res: Response): Promise<void> {
  // 🔒 SECURITY BOUNDARY — multi-tenant isolation.
  // companyId MUST come from the verified JWT (req.companyId). Do NOT read
  // it from req.body / req.query / req.params on this endpoint, otherwise
  // a client could enumerate other tenants' leaderboards.
  const companyId = req.companyId;
  if (!companyId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const users = await User.find({ companyId })
      .select({ _id: 1, name: 1, companyId: 1 })
      .lean<UserRow[]>();

    const userIds = users.map((u) => u._id);
    const [scores, predictionRows] = await Promise.all([
      Score.find({ userId: { $in: userIds } })
        .select({ userId: 1, points: 1, exact: 1, outcome: 1 })
        .lean<ScoreRow[]>(),
      Prediction.find({ userId: { $in: userIds } })
        .select({ userId: 1, submittedAt: 1 })
        .lean<Array<{ userId: unknown; submittedAt: unknown }>>(),
    ]);

    const submissionTimes = buildSubmissionTimes(predictionRows);
    const rows = buildLeaderboard(users, scores, undefined, submissionTimes);
    res.json({ leaderboard: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

/**
 * GET /leaderboard/overall — every user across every company. Each row
 * carries the user's `companyName` so the UI can show tenant alongside name.
 * No filtering by tenant; auth only confirms the caller has an account.
 */
export async function getOverallLeaderboard(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const [users, scores, companies, predictionRows] = await Promise.all([
      User.find({}).select({ _id: 1, name: 1, companyId: 1 }).lean<UserRow[]>(),
      Score.find({}).select({ userId: 1, points: 1, exact: 1, outcome: 1 }).lean<ScoreRow[]>(),
      Company.find({}).select({ _id: 1, name: 1 }).lean<Array<{ _id: unknown; name: string }>>(),
      Prediction.find({})
        .select({ userId: 1, submittedAt: 1 })
        .lean<Array<{ userId: unknown; submittedAt: unknown }>>(),
    ]);

    const companyNames = new Map<string, string>();
    for (const c of companies) {
      const id = typeof c._id === "string" ? c._id : String(c._id);
      companyNames.set(id, c.name);
    }

    const submissionTimes = buildSubmissionTimes(predictionRows);
    const rows = buildLeaderboard(users, scores, companyNames, submissionTimes);
    res.json({ leaderboard: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
