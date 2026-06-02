import { Router } from "express";
import { register, login, authenticate } from "../controllers/auth.controller";

/**
 * /auth router. Multi-tenant flow:
 *   POST /auth/register { name, email, password, companyId }
 *   POST /auth/login    { email, password }
 *
 * companyId is picked from the seeded list on the client (see
 * GET /companies?q=) and validated server-side.
 *
 * /auth/authenticate is kept as a back-compat alias for the upstream client.
 */
const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/authenticate", authenticate);

export default router;
