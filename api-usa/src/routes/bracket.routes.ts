import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getRealBracket, getMyBracket } from "../controllers/bracket.controller";

/**
 * /bracket router — both endpoints require a Bearer JWT.
 *
 *   GET /bracket/real  → official bracket from admin-entered results
 *   GET /bracket/me    → caller's predicted bracket from their predictions
 */
const router = Router();

router.get("/real", requireAuth, getRealBracket);
router.get("/me",   requireAuth, getMyBracket);

export default router;
