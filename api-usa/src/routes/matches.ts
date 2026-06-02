import { Router, type Request, type Response } from "express";
import { Match } from "../models/Match";
import { requireAdmin } from "../middleware/requireAdmin";
import { scoreMatch, rescoreDownstreamOf } from "../services/scoreMatch";
import { listMatches } from "../controllers/matches.controller";

const router = Router();

// GET /matches — public listing with team {id,name,fifa_code} resolved.
router.get("/", listMatches);

// POST /matches/:id/result   (admin only)
// Body: { homeScore: number, awayScore: number }
router.post("/:id/result", requireAdmin, async (req: Request, res: Response) => {
  const matchId = Number(req.params.id);
  const { homeScore, awayScore } = req.body;

  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)
      || homeScore < 0 || awayScore < 0) {
    return res.status(400).json({ error: "Scores must be non-negative integers." });
  }

  const match = await Match.findOneAndUpdate(
    { id: matchId },
    { $set: { homeScore, awayScore, finished: true } },
    { new: true }
  );
  if (!match) return res.status(404).json({ error: "Match not found." });

  // Score the match itself, then sweep finished KO matches to pick up any
  // that were previously deferred — admin can record results in any order
  // and the scorer self-corrects.
  const primary = await scoreMatch(matchId);
  const downstream = await rescoreDownstreamOf(matchId);
  return res.json({ match, primary, downstream });
});

export default router;
