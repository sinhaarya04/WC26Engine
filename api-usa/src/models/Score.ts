import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Score — denormalized per-prediction points + breakdown booleans.
 *
 * A user's leaderboard row is computed by summing/counting THIS collection,
 * never by re-running the scorer at read time. The breakdown bools mirror
 * `ScoreBreakdown` from services/scoring.ts so that tiebreakers (exact-count,
 * outcome-count) can be aggregated directly from stored rows.
 *
 * Unique compound index on (userId, matchId) enforces idempotency: re-running
 * scoreMatch() for the same match overwrites instead of duplicating.
 */
const ScoreSchema = new Schema(
  {
    userId:      { type: Schema.Types.ObjectId, required: true, ref: "User" },
    matchId:     { type: Number, required: true },
    points:      { type: Number, required: true, default: 0 },
    // Mirror of ScoreBreakdown — written by scoreMatch, read by leaderboard.
    exact:       { type: Boolean, required: true, default: false },
    gd:          { type: Boolean, required: true, default: false },
    outcome:     { type: Boolean, required: true, default: false },
    advancement: { type: Boolean, required: true, default: false },
    computedAt:  { type: Date, default: Date.now },
  },
  { timestamps: false },
);

ScoreSchema.index({ userId: 1, matchId: 1 }, { unique: true });
ScoreSchema.index({ userId: 1 });

export type ScoreDoc = InferSchemaType<typeof ScoreSchema>;
export const Score = model("Score", ScoreSchema);
export default Score;
