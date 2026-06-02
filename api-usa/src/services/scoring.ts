/**
 * Cumulative stacking scorer (matchup-gated for knockouts).
 *
 * For any prediction vs the actual 90-minute result:
 *
 *   + 5  exact score          (both numbers right)
 *   + 4  goal difference      (predicted home-away == actual home-away)
 *   + 3  outcome              (predicted winner/draw matches actual)
 *
 * Knockouts additionally award:
 *   + 2  advancement bonus    (winnerPickTeamId equals the team that actually
 *                              advanced — either the regulation winner or, on
 *                              a level scoreline, the admin-recorded
 *                              advancingTeamId for ET/penalties).
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  KNOCKOUT MATCHUP GATING (option-(b) per the up-front bracket model)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * In the bracket model each user has their OWN derived knockout matchups
 * (from their own predicted group standings). So a user's "slot 73" may
 * pit completely different teams than the real M73. Scoring rules:
 *
 *   - Group scoring: unchanged. The matchup is always known and trivially
 *     matches; all three components fire on score correctness.
 *
 *   - Knockout `exact` / `gd` / `outcome` fire ONLY when the user's
 *     predicted (home, away) team pair matches the real match's actual
 *     (home, away) team pair on the SAME SIDE (no side-swap credit).
 *     If the user predicted the right scoreline against a wrong matchup,
 *     those three components are zero.
 *
 *   - Knockout `advancement` bonus fires independently of matchup: any
 *     time `winnerPickTeamId === advancingTeamId` (both non-empty), the
 *     +2 is awarded. A user who picked the right advancer in their own
 *     bracket gets credit even if the matchup didn't materialise in the
 *     real bracket.
 *
 * Lock of the Day has been REMOVED from this scorer (the up-front bracket
 * model has a single tournament-wide submission, not a per-day lock).
 *
 * Maxima: group = 5+4+3 = 12, knockout = 5+4+3+2 = 14.
 *
 * Pure function — no I/O. Caller is responsible for sourcing the advancing
 * team id and matchup team ids from match state (see services/scoreMatch.ts).
 */

export interface PredictionInput {
  home: number;
  away: number;
  /** Required for knockout scoring to award the advancement bonus. */
  winnerPickTeamId?: string | null;
  /** For knockouts: the team id the user has in their predicted HOME slot. */
  predHomeTeamId?: string | null;
  /** For knockouts: the team id the user has in their predicted AWAY slot. */
  predAwayTeamId?: string | null;
}

export interface ActualInput {
  home: number;
  away: number;
  /**
   * The team that advanced from this fixture. For knockouts this is the
   * regulation winner when scores differ, OR the admin-recorded winnerTeamId
   * when regulation ended level (ET/penalties). Ignored when isKnockout=false.
   */
  advancingTeamId?: string | null;
  /** For knockouts: the actual home team id of the real match. */
  homeTeamId?: string | null;
  /** For knockouts: the actual away team id of the real match. */
  awayTeamId?: string | null;
}

export interface ScoreInput {
  pred: PredictionInput | null;
  actual: ActualInput;
  isKnockout: boolean;
}

export interface ScoreBreakdown {
  exact: boolean;
  gd: boolean;
  outcome: boolean;
  advancement: boolean;
  points: number;
}

const EMPTY_BREAKDOWN: ScoreBreakdown = {
  exact: false,
  gd: false,
  outcome: false,
  advancement: false,
  points: 0,
};

/**
 * Whether the user's predicted matchup teams equal the actual match teams.
 * Side-sensitive — predicting (A vs B) against an actual (B vs A) does NOT
 * count, because score interpretation is side-dependent.
 *
 * For groups this is always true (matchup is fixed by the fixture); the
 * caller passes isKnockout=false and this gate is skipped.
 */
function matchupMatches(
  pred: PredictionInput,
  actual: ActualInput,
): boolean {
  const ph = pred.predHomeTeamId;
  const pa = pred.predAwayTeamId;
  const ah = actual.homeTeamId;
  const aa = actual.awayTeamId;
  if (!ph || !pa || !ah || !aa) return false;
  return ph === ah && pa === aa;
}

export function scorePrediction(input: ScoreInput): ScoreBreakdown {
  const { pred, actual, isKnockout } = input;
  if (!pred) return { ...EMPTY_BREAKDOWN };

  const exactRaw   = pred.home === actual.home && pred.away === actual.away;
  const predGD     = pred.home - pred.away;
  const actGD      = actual.home - actual.away;
  const gdRaw      = predGD === actGD;
  const outcomeRaw = Math.sign(predGD) === Math.sign(actGD);

  // Knockouts gate the score components on matchup identity. Groups don't.
  const componentsAllowed = isKnockout ? matchupMatches(pred, actual) : true;

  const exact   = componentsAllowed && exactRaw;
  const gd      = componentsAllowed && gdRaw;
  const outcome = componentsAllowed && outcomeRaw;

  let points = 0;
  if (exact)   points += 5;
  if (gd)      points += 4;
  if (outcome) points += 3;

  let advancement = false;
  if (
    isKnockout &&
    typeof pred.winnerPickTeamId === "string" &&
    pred.winnerPickTeamId.length > 0 &&
    typeof actual.advancingTeamId === "string" &&
    actual.advancingTeamId.length > 0 &&
    pred.winnerPickTeamId === actual.advancingTeamId
  ) {
    advancement = true;
    points += 2;
  }

  if (points < 0) points = 0; // explicit floor; unreachable by construction
  return { exact, gd, outcome, advancement, points };
}
