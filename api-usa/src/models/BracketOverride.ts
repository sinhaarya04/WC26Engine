import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Singleton admin override for parts of the bracket that FIFA's published
 * structure must override our pure solver. Today the only override type is
 * the eight third-place R32 slots; the `type` field is a discriminator left
 * room for future override categories (extra-time pairings, replays, etc.).
 *
 * Shape:
 *   {
 *     type: "thirdPlace",
 *     assignments: { "74": "C", "77": "G", … }  // matchId → group letter
 *     updatedAt, updatedBy
 *   }
 *
 * Absent = no override. The real bracket falls back to the deterministic
 * solver. Predicted brackets ALWAYS use the solver, never the override.
 */
const BracketOverrideSchema = new Schema(
  {
    type:        { type: String, required: true, unique: true },
    assignments: { type: Schema.Types.Mixed, required: true },
    updatedAt:   { type: Date, default: Date.now },
    updatedBy:   { type: String },
  },
  { timestamps: false },
);

export type BracketOverrideDoc = InferSchemaType<typeof BracketOverrideSchema>;
export const BracketOverride = model("BracketOverride", BracketOverrideSchema);
export default BracketOverride;
