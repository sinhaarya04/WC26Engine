import { Router } from "express";
import { getDeadline } from "../controllers/deadline.controller";

/**
 * /deadline — public router. No auth: the deadline is constant and the
 * frontend needs it on the auth screen too (for the countdown).
 *
 *   GET /deadline → { deadline, serverNow, isOpen }
 */
const router = Router();
router.get("/", getDeadline);
export default router;
