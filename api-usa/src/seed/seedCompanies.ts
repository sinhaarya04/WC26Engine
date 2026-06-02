/**
 * seed:companies — idempotently upsert the canonical client companies.
 *
 *   pnpm seed:companies
 *
 * Each entry is keyed by `name` (companies are unique by name; the
 * registration picker resolves typed text to a companyId via
 * GET /companies?q=). Re-runs are safe.
 *
 * Override via env JSON for ad-hoc tenants:
 *   COMPANIES='[{"name":"Acme"}]' pnpm seed:companies
 */

import { loadEnvConfig } from "../config/env";
import { connectDb, mongoose } from "../db";
import { Company } from "../models/Company";

interface SeedCompany {
  name: string;
}

const DEFAULT_COMPANIES: SeedCompany[] = [
  { name: "Tigress Financial Partners" },
  { name: "MetLife" },
  { name: "Morgan Stanley" },
  { name: "Goldman Sachs" },
  { name: "JPMorgan Chase" },
  { name: "Bank of America" },
  { name: "Citigroup" },
  { name: "Wells Fargo" },
  { name: "BlackRock" },
  { name: "Beta Test Co" },
  { name: "Demo Pool" },
];

function parseEnvList(): SeedCompany[] {
  const raw = process.env.COMPANIES;
  if (!raw) return DEFAULT_COMPANIES;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch {
    throw new Error("COMPANIES env must be JSON array of { name }");
  }
  if (!Array.isArray(parsed)) throw new Error("COMPANIES must be a JSON array");
  return parsed.map((row, i) => {
    if (typeof row !== "object" || row === null) throw new Error(`COMPANIES[${i}] not an object`);
    const r = row as { name?: unknown };
    if (typeof r.name !== "string") {
      throw new Error(`COMPANIES[${i}] must have string name`);
    }
    return { name: r.name.trim() };
  });
}

async function seedCompanies(): Promise<void> {
  loadEnvConfig();
  await connectDb();

  const rows = parseEnvList();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const result = await Company.findOneAndUpdate(
      { name: row.name },
      { $setOnInsert: { name: row.name, createdAt: new Date() } },
      { upsert: true, new: false },
    );
    if (result) updated++; else created++;
    console.log(`  ${result ? "exists" : "created"}: ${row.name}`);
  }

  console.log(`✅ seed:companies — ${created} created, ${updated} already existed.`);
  await mongoose.connection.close();
}

seedCompanies().catch((err) => {
  console.error("❌ seed:companies failed:", err.message);
  process.exit(1);
});
