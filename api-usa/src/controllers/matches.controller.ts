import type { Request, Response } from "express";
import { Match } from "../models/Match";
import { Team } from "../models/team";

/**
 * GET /matches — list every fixture with home/away team { id, name, fifa_code }
 * resolved, kickoff, status, and result (only when finished).
 *
 * Public read-only endpoint. Match results land here through the admin route
 * (POST /matches/:id/result); this endpoint just surfaces the current state.
 */

interface TeamSummary {
  id: string;
  name: string;
  fifa_code: string;
  /**
   * FIFA seed (lower wins ties). Exposed so the frontend bracket-fill view's
   * cascade preview uses the same tiebreaker value the backend uses on
   * submit — otherwise a tied group's standings can diverge and the user's
   * submission is rejected for a "consistent" pick that the preview made.
   */
  seed: number;
}

interface MatchResult {
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
}

interface MatchView {
  id: number;
  type: string;
  group: string | null;
  matchday: number | null;
  kickoffUtc: string;     // ISO-8601
  status: "finished" | "scheduled";
  home: TeamSummary | { label: string | null };
  away: TeamSummary | { label: string | null };
  result: MatchResult | null;
}

function teamView(
  teamId: string | null | undefined,
  label: string | null | undefined,
  teamsById: Map<string, { id: string; name: string; fifa_code: string; seed: number }>,
): TeamSummary | { label: string | null } {
  if (teamId) {
    const t = teamsById.get(teamId);
    if (t) return { id: t.id, name: t.name, fifa_code: t.fifa_code, seed: t.seed };
  }
  // No resolved team yet (knockout slot before its feeder finishes). Surface
  // the placeholder label the importer stored ("Winner Group A", "1B vs 2A", …).
  return { label: label ?? null };
}

export async function listMatches(_req: Request, res: Response): Promise<void> {
  const [matches, teams] = await Promise.all([
    Match.find({}).sort({ id: 1 }).lean(),
    Team.find({}).lean(),
  ]);

  const teamsById = new Map(
    teams.map((t) => [
      t.id as string,
      {
        id: t.id as string,
        name: t.name as string,
        fifa_code: t.fifa_code as string,
        seed: t.seed as number,
      },
    ]),
  );

  const view: MatchView[] = matches.map((m) => {
    const finished = Boolean(m.finished);
    const kickoff = m.kickoffUtc instanceof Date ? m.kickoffUtc : new Date(m.kickoffUtc as string);

    return {
      id: m.id as number,
      type: m.type as string,
      group: (m.group as string | undefined) ?? null,
      matchday: (m.matchday as number | undefined) ?? null,
      kickoffUtc: kickoff.toISOString(),
      status: finished ? "finished" : "scheduled",
      home: teamView(m.homeTeamId as string | undefined, m.homeLabel as string | undefined, teamsById),
      away: teamView(m.awayTeamId as string | undefined, m.awayLabel as string | undefined, teamsById),
      result: finished
        ? {
            homeScore: m.homeScore as number,
            awayScore: m.awayScore as number,
            winnerTeamId: (m.winnerTeamId as string | null | undefined) ?? null,
          }
        : null,
    };
  });

  res.json({ matches: view });
}
