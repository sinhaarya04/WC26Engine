import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Prediction — one user's pick on one bracket slot.
 *
 * Under the up-front bracket model, every user has at most 104 Prediction
 * rows (72 group + 32 knockout) all written in a single transactional
 * upsert via PUT /predictions/bracket.
 *
 * Group rows (matchId 1..72):
 *   - homeScorePred + awayScorePred only.
 *   - winnerPickTeamId / predHomeTeamId / predAwayTeamId stay null.
 *
 * Knockout rows (matchId 73..104):
 *   - homeScorePred + awayScorePred required.
 *   - winnerPickTeamId required — the team the user predicts advances from
 *     THEIR own bracket slot (validated against their cascading bracket).
 *   - predHomeTeamId + predAwayTeamId are the team ids the user's bracket
 *     placed in this slot's home/away (derived by the validator at submit
 *     time). Scoring uses these to gate exact/gd/outcome components on
 *     matchup identity vs the real match (services/scoring.ts).
 *
 * Lock of the Day has been REMOVED — the up-front bracket has a single
 * tournament-wide deadline rather than per-day lock picks.
 */
const PredictionSchema = new Schema(
  {
    userId:            { type: Schema.Types.ObjectId, required: true, ref: "User" },
    matchId:           { type: Number, required: true },
    homeScorePred:     { type: Number, default: null },
    awayScorePred:     { type: Number, default: null },
    winnerPickTeamId:  { type: String, default: null },
    predHomeTeamId:    { type: String, default: null },
    predAwayTeamId:    { type: String, default: null },
    submittedAt:       { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// One prediction per user per match slot.
PredictionSchema.index({ userId: 1, matchId: 1 }, { unique: true });
PredictionSchema.index({ matchId: 1 });

export type PredictionDoc = InferSchemaType<typeof PredictionSchema>;
export const Prediction = model("Prediction", PredictionSchema);
export default Prediction;
