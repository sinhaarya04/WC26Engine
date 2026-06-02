import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Match — single tournament fixture. Created here as a Stage-2-minimum so that
 * Stage-4 scoring can compile. Stage 2 may extend (e.g., add indexes on type,
 * group, kickoffUtc) but the field names below are the contract.
 *
 * `id` is a number to match the upstream matches.json (1..104).
 */
const MatchSchema = new Schema(
  {
    id:         { type: Number, required: true, unique: true },
    type:       { type: String, required: true, enum: ["group", "r32", "r16", "qf", "sf", "third", "final"] },
    group:      { type: String },
    matchday:   { type: Number },
    homeTeamId: { type: String },
    awayTeamId: { type: String },
    homeLabel:  { type: String },
    awayLabel:  { type: String },
    kickoffUtc: { type: Date, required: true },
    finished:   { type: Boolean, default: false },
    // null until an admin records the real result via POST /matches/:id/result.
    homeScore:  { type: Number, default: null },
    awayScore:  { type: Number, default: null },
    // For knockout matches that are level on score, the team id that advanced
    // (after ET / penalties). Null otherwise. Used by /bracket/real.
    winnerTeamId: { type: String, default: null },
  },
  { timestamps: false },
);

MatchSchema.index({ id: 1 });

export type MatchDoc = InferSchemaType<typeof MatchSchema>;
export const Match = model("Match", MatchSchema);
export default Match;
