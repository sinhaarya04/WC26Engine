import type { Request, Response } from "express";
import mongoose from "mongoose";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../../package.json") as { version: string };

const DB_STATE: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

export async function getHealth(_req: Request, res: Response): Promise<void> {
  try {
    const state = mongoose.connection.readyState;
    const dbStatus = DB_STATE[state] ?? "unknown";
    const healthy = state === 1;

    const mem = process.memoryUsage();
    const body = {
      status: healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: pkg.version,
      environment: process.env.NODE_ENV || "development",
      database: { status: dbStatus, name: mongoose.connection.name || "N/A" },
      memory: {
        used:  Math.round(mem.heapUsed  / 1024 / 1024) + " MB",
        total: Math.round(mem.heapTotal / 1024 / 1024) + " MB",
      },
    };
    res.status(healthy ? 200 : 503).json(body);
  } catch (err) {
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: (err as Error).message,
    });
  }
}
