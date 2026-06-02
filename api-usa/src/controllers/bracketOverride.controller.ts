import type { Request, Response } from "express";
import { BracketOverride } from "../models/BracketOverride";
import { validateThirdPlaceOverride } from "../services/overrideValidation";

const TYPE = "thirdPlace";

/** GET /admin/bracket/third-place-override — read current override (if any). */
export async function getThirdPlaceOverride(_req: Request, res: Response): Promise<void> {
  try {
    const doc = await BracketOverride.findOne({ type: TYPE }).lean<{
      assignments: Record<string, string>;
      updatedAt?: Date;
      updatedBy?: string;
    } | null>();

    if (!doc) {
      res.json({ active: false });
      return;
    }
    res.json({
      active: true,
      assignments: doc.assignments,
      updatedAt: doc.updatedAt,
      updatedBy: doc.updatedBy,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

/**
 * POST /admin/bracket/third-place-override
 * Body: { assignments: { "74": "C", "77": "G", … } }
 *
 * Upserts the singleton override. Rejects (400) if validation fails.
 */
export async function setThirdPlaceOverride(req: Request, res: Response): Promise<void> {
  const body = req.body as { assignments?: unknown };
  const result = validateThirdPlaceOverride(body?.assignments);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  try {
    // Store with string keys (JSON-natural) so reads round-trip cleanly.
    const stored: Record<string, string> = {};
    for (const [k, v] of Object.entries(result.assignments)) stored[k] = v;

    await BracketOverride.updateOne(
      { type: TYPE },
      {
        $set: {
          assignments: stored,
          updatedAt: new Date(),
          updatedBy: req.userId,
        },
      },
      { upsert: true },
    );
    res.json({ active: true, assignments: stored });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

/** DELETE /admin/bracket/third-place-override — revert to the solver. */
export async function clearThirdPlaceOverride(_req: Request, res: Response): Promise<void> {
  try {
    await BracketOverride.deleteOne({ type: TYPE });
    res.json({ active: false });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
