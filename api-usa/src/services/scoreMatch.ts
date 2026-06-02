import { Match } from "../models/Match";
import { Team } from "../models/team";
import { Prediction } from "../models/Prediction";
import { Score } from "../models/Score";
import { scorePrediction } from "./scoring";
import { buildRealBracket, type MatchData, type TeamData } from "./bracketService";

/** Match.type values that are knockout fixtures. */
const KNOCKOUT_TYPES = new Set(["r32", "r16", "qf", "sf", "third", "final"]);

/** Every knockout match id, in canonical resolution order. */
const KO_MATCH_IDS = Array.from({ length: 32 }, (_, i) => 73 + i);

/**
 * Outcome of an attempt to score one match.
 *
 *   scored   — Predictions were evaluated and Score rows were written
 *              (or overwritten — upserts are idempotent).
 *   deferred — The KO matchup couldn't be derived because upstream
 *              feeders aren't all `finished` yet. NO Score rows were
 *              written; the match will be retried by rescoreDownstreamOf
 *              once the upstream lands.
 */
export type ScoreMatchResult =
  | { status: "scored";   matchId: number; count: number }
  | { status: "deferred"; matchId: number; reason: string };

/**
 * Recompute scores for every prediction on one match. Idempotent.
 *
 * Behaviour:
 *   - Group matches: Match.homeTeamId / awayTeamId are populated at seed
 *     time, so the matchup is always known. Always returns `scored`.
 *   - Knockout matches: the actual matchup (home / away team ids) is
 *     looked up on the Match doc when present, otherwise derived from
 *     buildRealBracket. If derivation can't resolve both sides (upstream
 *     feeders not all finished), we DEFER — return `{ status: "deferred" }`
 *     and write nothing. We do NOT zero out Score rows for matches that
 *     simply aren't ready to score.
 *
 * Throws only when the match doesn't exist or hasn't been recorded as
 * finished — those are programmer errors, not pipeline gaps.
 */
export async function scoreMatch(matchId: number): Promise<ScoreMatchResult> {
  const match = await Match.findOne({ id: matchId });
  if (!match || !match.finished) {
    throw new Error(`Match ${matchId} is not finished; cannot score.`);
  }
  const homeScore = match.homeScore as number;
  const awayScore = match.awayScore as number;
  const isKnockout = KNOCKOUT_TYPES.has(match.type as string);

  // Resolve the actual matchup (team ids) for this match.
  let actualHomeTeamId: string | null = (match.homeTeamId as string | null) ?? null;
  let actualAwayTeamId: string | null = (match.awayTeamId as string | null) ?? null;

  if (isKnockout && (!actualHomeTeamId || !actualAwayTeamId)) {
    const [allMatches, allTeams] = await Promise.all([
      Match.find({}).lean<MatchData[]>(),
      Team.find({}).lean<TeamData[]>(),
    ]);
    const real = buildRealBracket(allMatches, allTeams);
    const slot = real.bracket.find((b) => b.matchId === matchId);
    if (slot?.home && !actualHomeTeamId) actualHomeTeamId = slot.home.id;
    if (slot?.away && !actualAwayTeamId) actualAwayTeamId = slot.away.id;
  }

  // 🚧 Defer guard.
  // For KO matches we need BOTH sides of the actual matchup before we can
  // score anyone — otherwise the matchup gate in services/scoring.ts would
  // zero every user's components AND the advancement bonus (because
  // advancingTeamId is derived from actualHomeTeamId / actualAwayTeamId).
  // Writing zeros under those conditions is silent under-scoring; defer
  // instead. The downstream sweep (services/scoreMatch#rescoreDownstreamOf)
  // re-attempts deferred matches whenever an upstream lands.
  if (isKnockout && (!actualHomeTeamId || !actualAwayTeamId)) {
    return {
      status: "deferred",
      matchId,
      reason: "upstream feeders not yet resolved",
    };
  }

  let advancingTeamId: string | null = null;
  if (isKnockout) {
    if (homeScore > awayScore)      advancingTeamId = actualHomeTeamId;
    else if (awayScore > homeScore) advancingTeamId = actualAwayTeamId;
    else                            advancingTeamId = (match.winnerTeamId as string | null) ?? null;
  }

  const actual = {
    home: homeScore,
    away: awayScore,
    advancingTeamId,
    homeTeamId: actualHomeTeamId,
    awayTeamId: actualAwayTeamId,
  };

  const predictions = await Prediction.find({ matchId });
  for (const p of predictions) {
    const pred =
      p.homeScorePred == null
        ? null
        : {
            home: p.homeScorePred,
            away: p.awayScorePred as number,
            winnerPickTeamId: (p.winnerPickTeamId as string | null | undefined) ?? null,
            predHomeTeamId: (p.predHomeTeamId as string | null | undefined) ?? null,
            predAwayTeamId: (p.predAwayTeamId as string | null | undefined) ?? null,
          };

    const breakdown = scorePrediction({ pred, actual, isKnockout });

    await Score.updateOne(
      { userId: p.userId, matchId },
      {
        $set: {
          points:      breakdown.points,
          exact:       breakdown.exact,
          gd:          breakdown.gd,
          outcome:     breakdown.outcome,
          advancement: breakdown.advancement,
          computedAt:  new Date(),
        },
      },
      { upsert: true },
    );
  }
  return { status: "scored", matchId, count: predictions.length };
}

/**
 * After scoring a match, sweep every FINISHED knockout match and re-attempt
 * scoring. The idea: an admin can enter results in any order — if M89 was
 * recorded before all of its R32 feeders, scoreMatch(89) deferred at the
 * time. As soon as those R32 results come in, this sweep notices M89 is
 * now resolvable and scores it. Same applies transitively across rounds.
 *
 * Why "all finished KO matches" rather than just downstream of `triggerId`?
 *   - A group match completing the last unscored fixture in a group can
 *     unlock EVERY R32 slot (buildRealBracket only resolves R32 once all
 *     12 groups are complete). Tracking the precise dependency graph is
 *     possible but fragile; an unconditional sweep over the 32 KO ids is
 *     bounded and trivially correct.
 *   - scoreMatch is idempotent: re-running on an already-scored match
 *     writes the same Score rows (the upserts cost a little I/O — fine
 *     for an admin-only endpoint).
 *
 * Skips the triggering match itself (already scored by the caller) and
 * any KO match that isn't `finished` yet.
 */
export async function rescoreDownstreamOf(triggerId: number): Promise<ScoreMatchResult[]> {
  const finishedKoIds = (await Match.find({
    id: { $in: KO_MATCH_IDS, $ne: triggerId },
    finished: true,
  })
    .select({ id: 1 })
    .lean()) as Array<{ id: number }>;

  // Walk in canonical (id-ascending) order so an earlier-round score lands
  // before any later-round attempt that depends on it.
  const ids = finishedKoIds.map((m) => m.id).sort((a, b) => a - b);

  const results: ScoreMatchResult[] = [];
  for (const id of ids) {
    try {
      results.push(await scoreMatch(id));
    } catch (err) {
      // Surface but don't abort the sweep — one bad row shouldn't block
      // the rest of the cascade.
      results.push({
        status: "deferred",
        matchId: id,
        reason: `scoreMatch threw: ${(err as Error).message}`,
      });
    }
  }
  return results;
}
