import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Tournament team. Schema mirrors the verified data/teams.json:
 *   id            — opaque team identifier (stored as String to match
 *                   Match.homeTeamId / Match.awayTeamId references)
 *   name          — display name (FIFA-correct: Türkiye, Czechia, DR Congo, …)
 *   fifa_code     — 3-letter FIFA code
 *   group         — group letter "A".."L"
 *   group_position— 1..4 within the group
 *   pot           — 1..4 (FIFA draw pot)
 *   seed          — final tiebreaker input. Equals pot for the 2026 draw, but
 *                   kept as its own field so this stays decoupled from pot
 *                   semantics elsewhere. Lower seed wins ties.
 */
const TeamSchema = new Schema(
  {
    id:             { type: String, required: true, unique: true },
    name:           { type: String, required: true },
    fifa_code:      { type: String, required: true },
    group:          { type: String, required: true, index: true },
    group_position: { type: Number, required: true },
    pot:            { type: Number, required: true },
    seed:           { type: Number, required: true },
  },
  { timestamps: false },
);

TeamSchema.index({ id: 1 });
TeamSchema.index({ group: 1 });

export type TeamDoc = InferSchemaType<typeof TeamSchema>;
export const Team = model("Team", TeamSchema);
export default Team;
