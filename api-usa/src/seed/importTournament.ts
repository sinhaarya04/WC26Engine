/**
 * Tournament seeder. Loads the verified data files:
 *   data/teams.json    — 48 teams
 *   data/matches.json  — 104 matches, all finished:false / homeScore:null / awayScore:null
 *
 * No demo users, no demo predictions, no pre-filled scores — those come from
 * real registration and from `POST /matches/:id/result` only.
 *
 * Idempotent-ish: drops the teams and matches collections before re-importing.
 * Does NOT touch users, companies, predictions, or scores.
 */

import fs from "fs";
import path from "path";
import { loadEnvConfig } from "../config/env";
import { connectDb, mongoose } from "../db";
import { Team } from "../models/team";
import { Match } from "../models/Match";

interface TeamSeed {
  id: number;
  name: string;
  fifa_code: string;
  group: string;
  group_position: number;
  pot: number;
  seed: number;
}

interface MatchSeed {
  id: number;
  type: "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";
  group?: string;
  matchday: number;
  homeTeamId?: string;
  awayTeamId?: string;
  homeLabel?: string;
  awayLabel?: string;
  kickoffUtc: string;
  finished: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

async function importTournament(): Promise<void> {
  loadEnvConfig();
  await connectDb();

  const dataDir = path.resolve(process.cwd(), "data");

  // ---------- Teams ----------
  console.log("Clearing existing teams...");
  await mongoose.connection.db.dropCollection("teams").catch(() => {
    console.log("  (no teams collection yet)");
  });

  // Teams data lives at the canonical FIFAPREDICTIONS/teams.json (one level
  // above the api-usa project root). The matches data stays under data/.
  const teamsPath = path.resolve(process.cwd(), "..", "teams.json");
  console.log(`Reading ${teamsPath}...`);
  const teams = JSON.parse(fs.readFileSync(teamsPath, "utf8")) as TeamSeed[];
  console.log(`Found ${teams.length} teams`);
  for (const t of teams) {
    if (typeof t.seed !== "number") {
      throw new Error(`Team ${t.id} (${t.name}) is missing a numeric seed in data/teams.json`);
    }
    if (typeof t.pot !== "number") {
      throw new Error(`Team ${t.id} (${t.name}) is missing a numeric pot in data/teams.json`);
    }
    // Stringify id at the storage boundary so Match.homeTeamId / awayTeamId
    // (both String) continue to reference teams correctly.
    await Team.create({
      id: String(t.id),
      name: t.name,
      fifa_code: t.fifa_code,
      group: t.group,
      group_position: t.group_position,
      pot: t.pot,
      seed: t.seed,
    });
  }
  console.log(`✅ ${await Team.countDocuments()} teams imported.`);

  // ---------- Matches ----------
  console.log("\nClearing existing matches...");
  await mongoose.connection.db.dropCollection("matches").catch(() => {
    console.log("  (no matches collection yet)");
  });

  const matchesPath = path.join(dataDir, "matches.json");
  console.log(`Reading ${matchesPath}...`);
  const matches = JSON.parse(fs.readFileSync(matchesPath, "utf8")) as MatchSeed[];
  console.log(`Found ${matches.length} matches`);

  for (const m of matches) {
    // Hard guard: never seed a match as already-played.
    if (m.finished !== false || m.homeScore !== null || m.awayScore !== null) {
      throw new Error(
        `Match ${m.id} in data/matches.json must have finished:false, homeScore:null, awayScore:null. ` +
          `Results are only ever set by POST /matches/:id/result.`,
      );
    }

    await Match.create({
      id: m.id,
      type: m.type,
      group: m.group,
      matchday: m.matchday,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeLabel: m.homeLabel,
      awayLabel: m.awayLabel,
      kickoffUtc: new Date(m.kickoffUtc),
      finished: false,
      homeScore: null,
      awayScore: null,
    });
  }
  console.log(`✅ ${await Match.countDocuments()} matches imported (all unplayed).`);

  console.log("\nSeed complete:");
  console.log("  ✓ 48 teams");
  console.log("  ✓ 104 matches, finished:false, homeScore:null, awayScore:null");
  console.log("  (Run `pnpm seed:admin` separately to provision the admin user.)");

  await mongoose.connection.close();
}

importTournament().catch((err) => {
  console.error("❌ importTournament failed:", err);
  process.exit(1);
});
