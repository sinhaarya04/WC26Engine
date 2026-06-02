import { Router } from "express";
import { requireAdmin } from "../middleware/requireAdmin";
import {
  getThirdPlaceOverride,
  setThirdPlaceOverride,
  clearThirdPlaceOverride,
} from "../controllers/bracketOverride.controller";

/**
 * /admin router. All routes are admin-only.
 *
 *   GET    /admin/bracket/third-place-override  — read current override
 *   POST   /admin/bracket/third-place-override  — set / replace
 *   DELETE /admin/bracket/third-place-override  — clear (revert to solver)
 */
const router = Router();

router.get(   "/bracket/third-place-override", requireAdmin, getThirdPlaceOverride);
router.post(  "/bracket/third-place-override", requireAdmin, setThirdPlaceOverride);
router.delete("/bracket/third-place-override", requireAdmin, clearThirdPlaceOverride);

export default router;
