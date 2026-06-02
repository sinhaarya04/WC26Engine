import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Company (tenant) — the multi-tenant boundary for this app. Every User
 * belongs to exactly one Company.
 *
 * Membership is self-selected at registration time from the seeded list
 * (the user picks their employer via a typeahead, server validates the
 * companyId exists). Not verified by invite code or email domain — see
 * the README's "company membership integrity" note.
 *
 * `name` is unique so the picker is unambiguous; seed:companies upserts
 * by name.
 */
const CompanySchema = new Schema(
  {
    name:      { type: String, required: true, unique: true, trim: true },
    createdAt: { type: Date,   default: Date.now },
  },
  { timestamps: false },
);

// Case-insensitive search index on name for the /companies?q= typeahead.
CompanySchema.index({ name: 1 }, { collation: { locale: "en", strength: 2 } });

export type CompanyDoc = InferSchemaType<typeof CompanySchema>;
export const Company = model("Company", CompanySchema);
export default Company;
