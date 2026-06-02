import path from "path";
import dotenv from "dotenv";

export interface AppConfig {
  NODE_ENV: "development" | "test" | "production";
  isDev: boolean;
  isProd: boolean;
  PORT: number;
  API_URL: string;
  FRONTEND_URL: string;
  MONGODB_URL: string;
  JWT_SECRET: string;
  SECRET: string;
  ACCESSCODEDEV: string;
  RATE_LIMIT_WINDOW: number;
  RATE_LIMIT_MAX: number;
  CORS_ORIGINS: string;
  LOG_LEVEL: string;
  ENABLE_SWAGGER: boolean;
  getCorsOrigins(): string | string[];
}

let configLoaded = false;
let cached: AppConfig | null = null;

/** Load (or return cached) environment configuration. */
export function loadEnvConfig(): AppConfig {
  if (configLoaded && cached) return cached;

  const NODE_ENV = (process.env.NODE_ENV || "development").trim() as AppConfig["NODE_ENV"];
  const envFile = NODE_ENV === "production" ? ".env.production" : ".env.development";
  const envPath = path.resolve(process.cwd(), envFile);

  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.warn(`⚠️  ${envFile} not found — falling back to defaults / process.env`);
    dotenv.config();
  }

  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`📁 Env file:    ${envFile}`);

  cached = {
    NODE_ENV,
    isDev: NODE_ENV === "development",
    isProd: NODE_ENV === "production",
    PORT: parseInt(process.env.PORT || "3050", 10),
    API_URL: process.env.API_URL || `http://localhost:${process.env.PORT || 3050}`,
    FRONTEND_URL: process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3050}`,
    // No fallback for MONGODB_URL — connectDb() validates and fails loudly
    // if missing/malformed. Tests use vi.mock and never call connectDb.
    MONGODB_URL: process.env.MONGODB_URL || "",
    // SECRET is the JWT signing key. In production it MUST be set explicitly
    // and MUST NOT match the dev placeholder — see assertSecretsForEnv() below.
    // In dev/test the fallback keeps local workflows + the test suite working.
    JWT_SECRET: process.env.JWT_SECRET || "worldcup2026_dev_secret_key",
    SECRET: process.env.SECRET || "worldcup2026_secret",
    ACCESSCODEDEV: process.env.ACCESSCODEDEV || "devcode123",
    RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW || "60000", 10),
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || "500", 10),
    CORS_ORIGINS: process.env.CORS_ORIGINS || "*",
    LOG_LEVEL: process.env.LOG_LEVEL || (NODE_ENV === "production" ? "error" : "debug"),
    ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === "true" || NODE_ENV === "development",
    getCorsOrigins(): string | string[] {
      const origins = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "*";
      if (origins === "*") return "*";
      const list = origins.split(",").map((o) => o.trim()).filter(Boolean);
      // In non-production, always allow the Vite dev server (and the Next
      // scaffold port, in case it's ever revived) so the prototype frontend
      // can reach the API in dev without env juggling.
      if (NODE_ENV !== "production") {
        for (const dev of ["http://localhost:5173", "http://localhost:3000"]) {
          if (!list.includes(dev)) list.push(dev);
        }
      }
      return list;
    },
  };

  assertSecretsForEnv(cached);
  configLoaded = true;
  return cached;
}

/**
 * Production-only secret validation. Fails the boot with a clear error
 * naming the missing/placeholder variable. We never want the dev fallback
 * "worldcup2026_secret" to sign real JWTs in a deployed environment.
 *
 * MONGODB_URL is left to connectDb() — same fail-fast principle, but the
 * check is colocated with the consumer there.
 */
function assertSecretsForEnv(c: AppConfig): void {
  if (!c.isProd) return;
  const missing: string[] = [];
  if (!process.env.SECRET || process.env.SECRET === "worldcup2026_secret") {
    missing.push("SECRET (JWT signing key — must be a long random string, NOT the dev placeholder)");
  }
  if (!process.env.MONGODB_URL) {
    missing.push("MONGODB_URL (MongoDB connection string)");
  }
  if (missing.length > 0) {
    throw new Error(
      "Missing or invalid required env vars in production:\n  - " +
        missing.join("\n  - ") +
        "\nSet these in your hosting platform (Render/Railway/Vercel) and redeploy.",
    );
  }
}

/** Loaded config — throws if accessed before loadEnvConfig() succeeds. */
export const config: AppConfig = new Proxy({} as AppConfig, {
  get(_t, prop) {
    if (!cached) loadEnvConfig();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cached as any)[prop as string];
  },
});
