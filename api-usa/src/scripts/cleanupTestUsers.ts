/**
 * cleanupTestUsers — delete test users + their predictions/scores.
 *
 * One-off cleanup so the leaderboard only shows real players. Matches
 * Users whose name contains "smoke" (case-insensitive) and prints what
 * would be deleted. With --apply, performs the deletion across User,
 * Prediction, and Score collections.
 *
 *   npx ts-node src/scripts/cleanupTestUsers.ts            # dry run
 *   npx ts-node src/scripts/cleanupTestUsers.ts --apply    # really delete
 *
 * Read-only without --apply. Connection comes from the same .env machinery
 * the API uses (MONGODB_URL).
 */
import mongoose from "mongoose";
import { loadEnvConfig } from "../config/env";
import { connectDb } from "../db";
import { User } from "../models/user";
import { Prediction } from "../models/Prediction";
import { Score } from "../models/Score";

const NAME_PATTERN = /smoke/i;

async function main() {
  const apply = process.argv.includes("--apply");
  loadEnvConfig();
  await connectDb();

  const users = await User.find({ name: { $regex: NAME_PATTERN } })
    .select({ _id: 1, name: 1, email: 1, companyId: 1 })
    .lean();

  if (users.length === 0) {
    console.log("No users matching /smoke/i found. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${users.length} user(s) matching /smoke/i:`);
  for (const u of users) {
    const userId = String(u._id);
    const [pCount, sCount] = await Promise.all([
      Prediction.countDocuments({ userId }),
      Score.countDocuments({ userId }),
    ]);
    console.log(`  - ${u.name} <${u.email}>  id=${userId}  predictions=${pCount}  scores=${sCount}`);
  }

  if (!apply) {
    console.log("\nDRY RUN. Re-run with --apply to actually delete.");
    await mongoose.disconnect();
    return;
  }

  const userIds = users.map((u) => String(u._id));
  console.log("\nDeleting…");
  const [pRes, sRes, uRes] = await Promise.all([
    Prediction.deleteMany({ userId: { $in: userIds } }),
    Score.deleteMany({ userId: { $in: userIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);
  console.log(`  Predictions removed: ${pRes.deletedCount}`);
  console.log(`  Scores removed:      ${sRes.deletedCount}`);
  console.log(`  Users removed:       ${uRes.deletedCount}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
