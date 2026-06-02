import type { Request, Response } from "express";
import { Company } from "../models/Company";

/**
 * GET /companies?q=<search>
 *
 * Public (no auth). Powers the registration page's company picker —
 * typeahead/autocomplete. Returns matches as { id, name }.
 *
 * - Case-insensitive partial match (regex anchored nowhere; "met" matches
 *   "MetLife" or "BioMet").
 * - Empty / missing q returns a capped list ordered by name.
 * - Results are capped at LIMIT to keep responses small and discourage
 *   enumerating the full tenant list with one request.
 */

const LIMIT = 25;

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchCompanies(req: Request, res: Response): Promise<void> {
  const raw = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const filter = raw.length > 0
    ? { name: new RegExp(escapeRegex(raw), "i") }
    : {};

  const docs = await Company.find(filter)
    .sort({ name: 1 })
    .limit(LIMIT)
    .select({ _id: 1, name: 1 });

  res.send(
    docs.map((d) => ({ id: String((d as { _id: unknown })._id), name: (d as { name: string }).name })),
  );
}
