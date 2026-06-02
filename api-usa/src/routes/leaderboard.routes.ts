import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getCompanyLeaderboard,
  getOverallLeaderboard,
} from "../controllers/leaderboard.controller";

/**
 * /leaderboard router — both endpoints require a Bearer JWT.
 *
 *   GET /leaderboard/company  → rows for caller's company only (JWT companyId)
 *   GET /leaderboard/overall  → every user, with company name attached
 */
const router = Router();

router.get("/company", requireAuth, getCompanyLeaderboard);
router.get("/overall", requireAuth, getOverallLeaderboard);

export default router;
