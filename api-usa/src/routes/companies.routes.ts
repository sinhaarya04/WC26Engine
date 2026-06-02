import { Router } from "express";
import { searchCompanies } from "../controllers/companies.controller";

/**
 * /companies — public lookup for the registration page company picker.
 *
 *   GET /companies?q=<search>  → [{ id, name }, …]
 *
 * No auth: the user is registering and has no token yet. The endpoint
 * leaks only company names (which are the brand/employer names users are
 * expected to recognise), capped per request.
 */
const router = Router();

router.get("/", searchCompanies);

export default router;
