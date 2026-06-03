import mongoose from "mongoose";
import { config } from "../config/env";

mongoose.set("strictQuery", false);

// Cache the connection promise on globalThis so Vercel serverless warm
// invocations reuse the existing connection instead of opening a new one.
declare global {
  // eslint-disable-next-line no-var
  var __mongooseConnection: Promise<typeof mongoose> | undefined;
}

export async function connectDb(): Promise<typeof mongoose> {
  // Fast path: already connected (warm invocation).
  if (mongoose.connection.readyState === 1) return mongoose;

  // If a connection attempt is in flight, wait for it.
  if (globalThis.__mongooseConnection) return globalThis.__mongooseConnection;

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

  globalThis.__mongooseConnection = mongoose
    .connect(url, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    })
    .then((m) => {
      console.log(`✅ connected to MongoDB (db: ${mongoose.connection.name})`);
      return m;
    })
    .catch((err) => {
      globalThis.__mongooseConnection = undefined;
      throw err;
    });

  return globalThis.__mongooseConnection;
}

export { mongoose };
