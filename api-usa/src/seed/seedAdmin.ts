/**
 * seed:admin — create OR promote a single admin user.
 *
 *   ADMIN_EMAIL=you@example.com \
 *   ADMIN_PASSWORD=...           \
 *   ADMIN_COMPANY_NAME="Tigress Financial Partners"   pnpm seed:admin
 *
 * - ADMIN_COMPANY_NAME must match a seeded Company.name exactly
 *   (run seed:companies first).
 * - If a user with that email exists: sets isAdmin=true and (re)attaches to the
 *   resolved company. Password untouched.
 * - If not: creates the user with a freshly hashed password, isAdmin=true,
 *   and companyId set from the resolved company.
 *
 * Credentials MUST come from env vars; never hardcoded.
 */

import bcrypt from "bcrypt";
import { loadEnvConfig } from "../config/env";
import { connectDb, mongoose } from "../db";
import { User } from "../models/user";
import { Company } from "../models/Company";

async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const companyName = process.env.ADMIN_COMPANY_NAME;
  if (!email || !password || !companyName) {
    throw new Error("Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_COMPANY_NAME env vars.");
  }

  loadEnvConfig();
  await connectDb();

  const company = await Company.findOne({ name: companyName });
  if (!company) {
    throw new Error(`Unknown ADMIN_COMPANY_NAME: ${companyName}. Run seed:companies first.`);
  }

  const normalized = email.toLowerCase();
  const existing = await User.findOne({ email: normalized }).select("+isAdmin");

  if (existing) {
    const doc = existing as unknown as { isAdmin: boolean; companyId: unknown };
    doc.isAdmin = true;
    doc.companyId = company._id;
    await existing.save();
    console.log(`Promoted existing user ${normalized} to admin (company=${company.name}).`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    // We've already hashed; assign directly and skip the pre-save hook via insertOne.
    await User.collection.insertOne({
      name: normalized.split("@")[0],
      email: normalized,
      password: passwordHash,
      companyId: company._id,
      isAdmin: true,
      createdAt: new Date(),
    });
    console.log(`Created new admin user ${normalized} (company=${company.name}).`);
  }

  await mongoose.connection.close();
}

seedAdmin().catch((err) => {
  console.error("❌ seed:admin failed:", err.message);
  process.exit(1);
});
