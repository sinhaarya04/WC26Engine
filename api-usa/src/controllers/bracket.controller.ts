import type { Request, Response } from "express";
import { Match } from "../models/Match";
import { Team } from "../models/team";
import { Prediction } from "../models/Prediction";
import { BracketOverride } from "../models/BracketOverride";
import {
  buildRealBracket,
  buildMyBracket,
  type MatchData,
  type TeamData,
  type PredictionData,
  type RealBracketOptions,
} from "../services/bracketService";
import type {
  GroupLetter,
  ThirdPlaceMatchId,
} from "../core/thirdPlaceTable";

/**
 * GET /bracket/real — the official tournament bracket as it stands today.
 *
 * R32 third-place slots: if an admin override exists AND its groups match
 * the actual qualifying thirds, the override is applied. Otherwise the
 * solver runs (with a `warning` surfaced when an override exists but doesn't
 * match the standings).
 */
export async function getRealBracket(_req: Request, res: Response): Promise<void> {
  try {
    const [matches, teams, override] = await Promise.all([
      Match.find({}).lean<MatchData[]>(),
      Team.find({}).lean<TeamData[]>(),
      BracketOverride.findOne({ type: "thirdPlace" }).lean<{
        assignments: Record<string, string>;
      } | null>(),
    ]);

    const realOptions: RealBracketOptions = {};
    if (override?.assignments) {
      // Mongo stores keys as strings; convert to typed numeric matchIds.
      const assignments: Partial<Record<ThirdPlaceMatchId, GroupLetter>> = {};
      for (const [k, v] of Object.entries(override.assignments)) {
        assignments[Number(k) as ThirdPlaceMatchId] = v as GroupLetter;
      }
      realOptions.thirdPlaceOverride = {
        assignments: assignments as Readonly<Record<ThirdPlaceMatchId, GroupLetter>>,
      };
    }

    res.json(buildRealBracket(matches, teams, realOptions));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

/**
 * GET /bracket/me — the requesting user's predicted bracket. Same shape as
 * /bracket/real, but built from THIS user's predictions and ALWAYS using
 * the solver for the third-place table (admin overrides do not apply).
 */
export async function getMyBracket(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const [matches, teams, predictions] = await Promise.all([
      Match.find({}).lean<MatchData[]>(),
      Team.find({}).lean<TeamData[]>(),
      Prediction.find({ userId: req.userId }).lean<PredictionData[]>(),
    ]);
    res.json(buildMyBracket(matches, teams, predictions));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
