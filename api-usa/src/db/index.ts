import mongoose from "mongoose";
import { config } from "../config/env";

mongoose.set("strictQuery", false);

/**
 * Connect to MongoDB.
 *
 * - Reads MONGODB_URL from env (loaded via loadEnvConfig).
 * - Validates the variable is present and looks like a mongo URI before
 *   handing it to the driver — fails loudly with a helpful message
 *   naming the env var rather than leaking a malformed URL.
 * - Never logs the connection string or password. On success, logs the
 *   resolved database name only.
 */
export async function connectDb(): Promise<typeof mongoose> {
  const url = config.MONGODB_URL;

  if (!url || url.trim().length === 0) {
    throw new Error(
      "MONGODB_URL is not set. Add it to .env.development (or .env.production) " +
      "before starting the server. Never commit this value.",
    );
  }
  if (!/^mongodb(\+srv)?:\/\//i.test(url)) {
    throw new Error(
      "MONGODB_URL is set but does not start with mongodb:// or mongodb+srv://. " +
      "Check the value in your .env file.",
    );
  }

  console.log(`🔌 Connecting to MongoDB (${config.isProd ? "Production" : "Development"})...`);

  await mongoose.connect(url, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  // mongoose.connection.name is the database name (e.g. "worldcup2026"),
  // NOT the URL. Safe to log.
  console.log(`✅ connected to MongoDB (db: ${mongoose.connection.name})`);
  return mongoose;
}

export { mongoose };
