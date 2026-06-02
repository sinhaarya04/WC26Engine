import type { Request, Response } from "express";
import { SUBMISSION_DEADLINE_UTC } from "../config/deadline";

/**
 * GET /deadline — public.
 *
 * Returns the bracket submission deadline plus current server time so the
 * frontend can drive a trustworthy countdown off of an offset to the local
 * clock instead of trusting it directly. `isOpen` is computed strictly from
 * server time vs the constant — clients never supply a timestamp here.
 */
export function getDeadline(_req: Request, res: Response): void {
  const now = new Date();
  res.json({
    deadline: SUBMISSION_DEADLINE_UTC.toISOString(),
    serverNow: now.toISOString(),
    isOpen: now.getTime() < SUBMISSION_DEADLINE_UTC.getTime(),
  });
}
