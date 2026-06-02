/**
 * API entry. Stage 1: only /health is mounted publicly; /auth is mounted but
 * still uses the simple register/login from the upstream code. Stage 3 will
 * rewrite /auth for invite codes + multi-tenant. Stage 4 adds /predictions
 * and /matches/:id/result. Stage 5 adds /leaderboard/*.
 */

import { loadEnvConfig, config } from "./config/env";
loadEnvConfig();

import express, { type Express, type Request, type Response, type NextFunction } from "express";
import bodyParser from "body-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";

import { connectDb } from "./db";
import authRoutes from "./routes/auth.routes";
import companiesRoutes from "./routes/companies.routes";
import healthRoutes from "./routes/health.routes";
import matchesRoutes from "./routes/matches";
import predictionsRoutes from "./routes/predictions.routes";
import bracketRoutes from "./routes/bracket.routes";
import adminRoutes from "./routes/admin.routes";
import leaderboardRoutes from "./routes/leaderboard.routes";
import deadlineRoutes from "./routes/deadline.routes";

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
});

export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy in production.
  app.set("trust proxy", 1);

  // CORS first.
  app.use(
    cors({
      origin: config.getCorsOrigins(),
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept"],
      credentials: true,
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(compression());

  const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW,
    max: config.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });
  app.use(limiter);

  app.use(morgan(":date[iso] :method :url :status :res[content-length] - :response-time ms"));

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json({ limit: "10kb" }));

  // Swagger UI (dev only by default).
  if (config.ENABLE_SWAGGER) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { specs, swaggerUi } = require("./swagger") as typeof import("./swagger");
      app.use(
        "/api-docs",
        swaggerUi.serve,
        swaggerUi.setup(specs, {
          customCss: ".swagger-ui .topbar { display: none }",
          customSiteTitle: "World Cup 2026 API",
        }),
      );
      console.log("📚 Swagger UI mounted at /api-docs");
    } catch (err) {
      console.error("⚠️  Swagger failed to mount:", (err as Error).message);
    }
  }

  // Welcome.
  app.get("/", (_req: Request, res: Response) => {
    res.json({ name: "worldcup2026-api", status: "ok" });
  });

  // Routes — Stages 1 + 4(partial) surface area.
  app.use("/auth", authRoutes);
  app.use("/companies", companiesRoutes);
  app.use("/health", healthRoutes);
  app.use("/matches", matchesRoutes);
  app.use("/predictions", predictionsRoutes);
  app.use("/bracket", bracketRoutes);
  app.use("/admin", adminRoutes);
  app.use("/leaderboard", leaderboardRoutes);
  app.use("/deadline", deadlineRoutes);

  // 404
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const err = new Error(`Route not found: ${req.method} ${req.url}`) as Error & { status?: number };
    err.status = 404;
    next(err);
  });

  // Error handler — must be last.
  app.use(
    (
      error: Error & { status?: number },
      _req: Request,
      res: Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: NextFunction,
    ) => {
      const status = error.status || 500;
      console.error(`❌ Error ${status}: ${error.message}`);
      res.status(status).send({ error: { message: error.message } });
    },
  );

  return app;
}

export async function start(): Promise<void> {
  try {
    await connectDb();
  } catch (err) {
    // Fail loudly: a server without a database is broken in ways the
    // /health endpoint alone can't surface. Exit so the operator sees it.
    console.error("❌ Could not connect to MongoDB:", (err as Error).message);
    console.error("   Fix the connection (MONGODB_URL) and restart.");
    process.exit(1);
  }
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`🚀 Server listening on port ${config.PORT}`);
  });
}

if (require.main === module) {
  void start();
}
