import { Schema, model, type InferSchemaType } from "mongoose";
import bcrypt from "bcrypt";

/**
 * User account. Multi-tenant via required `companyId` — set at register time
 * from a server-side Company.findById lookup against the id the user picked
 * from the typeahead. NEVER trust a client-supplied companyId on any
 * authenticated endpoint (auth/register validates existence, then uses the
 * resolved Company._id; downstream handlers read companyId from the JWT).
 *
 * NOTE: password is `select: false` so reads never include the hash.
 */
const UserSchema = new Schema(
  {
    name:     { type: String, required: true },
    email:    { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    // Tenant boundary. Required for every user; seed:admin assigns one too.
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    // Hidden by default — endpoints must `.select('+isAdmin')` to read it.
    isAdmin:  { type: Boolean, default: false, select: false },
    passwordResetToken:   { type: String, select: false },
    passwordResetExpires: { type: Date,   select: false },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Hash password on save.
UserSchema.pre("save", async function hashPassword(next) {
  // `this` is the document; cast through unknown to satisfy strict mode.
  const doc = this as unknown as { password?: string; isModified: (k: string) => boolean };
  if (!doc.isModified("password") || !doc.password) {
    next();
    return;
  }
  const hash = await bcrypt.hash(doc.password, 10);
  doc.password = hash;
  next();
});

export type UserDoc = InferSchemaType<typeof UserSchema>;
export const User = model("User", UserSchema);
export default User;
