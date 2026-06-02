import { Router } from "express";
import { getHealth } from "../controllers/health.controller";

/** /health router. No auth — used by uptime checks. */
const router = Router();

router.get("/", getHealth);

export default router;
