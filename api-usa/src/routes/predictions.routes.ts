import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  putBracket,
  getBracket,
  submitPrediction,
  getMyPredictions,
} from "../controllers/predictions.controller";

/**
 * /predictions router. All endpoints require a valid JWT.
 *
 *   PUT  /predictions/bracket   submit/replace the user's full bracket
 *   GET  /predictions/bracket   read the user's current bracket (structured)
 *   GET  /predictions/me        raw prediction rows (debug / admin)
 *   POST /predictions           410 Gone — replaced by PUT /bracket
 */
const router = Router();

router.put("/bracket", requireAuth, putBracket);
router.get("/bracket", requireAuth, getBracket);
router.get("/me", requireAuth, getMyPredictions);
router.post("/", requireAuth, submitPrediction); // returns 410

export default router;
