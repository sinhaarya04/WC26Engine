/**
 * Vercel Serverless Function entry point.
 *
 * Wraps the Express app so Vercel can invoke it as a serverless function.
 * vercel.json rewrites all paths to this single function.
 */

import { loadEnvConfig } from "../src/config/env";
loadEnvConfig();

import { createApp } from "../src/index";
import { connectDb } from "../src/db";
import type { IncomingMessage, ServerResponse } from "http";

const app = createApp();

let dbReady: Promise<void> | null = null;

function ensureDb(): Promise<void> {
  if (!dbReady) {
    dbReady = connectDb()
      .then(() => {})
      .catch((err) => {
        dbReady = null;
        throw err;
      });
  }
  return dbReady;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ensureDb();
  app(req as any, res as any);
}
