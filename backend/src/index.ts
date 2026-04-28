import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import dotenv from "dotenv";

dotenv.config();

import { Sentry, sentryEnabled } from "./lib/sentry.js";
import { logger } from "./lib/logger.js";
import prisma from "./lib/prisma.js";
import { redisConnection } from "./lib/queue.js";
import authRoutes from "./routes/auth.js";
import settingsRoutes from "./routes/settings.js";
import campaignsRoutes from "./routes/campaigns.js";
import leadsRoutes from "./routes/leads.js";
import statsRoutes from "./routes/stats.js";
import blacklistRoutes from "./routes/blacklist.js";
import analyticsRoutes from "./routes/analytics.js";
import vapiSyncRoutes from "./routes/vapi-sync.js";
import contactsRoutes from "./routes/contacts.js";
import notesRoutes from "./routes/notes.js";
import tasksRoutes from "./routes/tasks.js";
import dealsRoutes from "./routes/deals.js";
import demoRoutes from "./routes/demo.js";
import privacyRoutes from "./routes/privacy.js";
import platformAuthRoutes from "./routes/platform/auth.js";
import platformOrgsRoutes from "./routes/platform/organizations.js";
import platformPlansRoutes from "./routes/platform/plans.js";
import platformMetricsRoutes from "./routes/platform/metrics.js";
import platformAuditRoutes from "./routes/platform/audit.js";
import billingRoutes from "./routes/billing.js";
import "./workers/index.js";

const app = express();
const PORT = process.env.PORT || 4000;

const tenantOrigin = process.env.TENANT_APP_ORIGIN || "http://localhost:3000";
const adminOrigin = process.env.ADMIN_APP_ORIGIN || "http://localhost:3001";
const allowedOrigins = [tenantOrigin, adminOrigin];

// Security headers — keep contentSecurityPolicy off here; the frontend (Next.js) owns CSP.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

// Billing router first — its /webhook path uses raw body (Stripe signature verification)
app.use("/api/billing", billingRoutes);

app.use(express.json());

app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    serializers: {
      req: (req: any) => ({ method: req.method, url: req.url, id: req.id }),
      res: (res: any) => ({ statusCode: res.statusCode }),
    },
  })
);

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Try again in 15 minutes." },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Rate limit exceeded." },
});

// Tenant API routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/settings", apiLimiter, settingsRoutes);
app.use("/api/campaigns", apiLimiter, campaignsRoutes);
app.use("/api/leads", apiLimiter, leadsRoutes);
app.use("/api/stats", apiLimiter, statsRoutes);
app.use("/api/blacklist", apiLimiter, blacklistRoutes);
app.use("/api/analytics", apiLimiter, analyticsRoutes);
app.use("/api/vapi", apiLimiter, vapiSyncRoutes);
app.use("/api/contacts", apiLimiter, contactsRoutes);
app.use("/api/notes", apiLimiter, notesRoutes);
app.use("/api/tasks", apiLimiter, tasksRoutes);
app.use("/api/deals", apiLimiter, dealsRoutes);
app.use("/api/demo", apiLimiter, demoRoutes);
app.use("/api/privacy", apiLimiter, privacyRoutes);

// Platform (super-admin) API routes — separate, lower-volume limiter
const platformLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });
app.use("/api/platform/auth", authLimiter, platformAuthRoutes);
app.use("/api/platform/organizations", platformLimiter, platformOrgsRoutes);
app.use("/api/platform/plans", platformLimiter, platformPlansRoutes);
app.use("/api/platform/metrics", platformLimiter, platformMetricsRoutes);
app.use("/api/platform/audit", platformLimiter, platformAuditRoutes);

// Health check — verifies DB + Redis connectivity
app.get("/health", async (_req, res) => {
  const checks: Record<string, "ok" | "error"> = { service: "ok" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    checks.database = "error";
    logger.error({ err }, "health: database check failed");
  }
  try {
    const pong = await redisConnection.ping();
    checks.redis = pong === "PONG" ? "ok" : "error";
  } catch (err) {
    checks.redis = "error";
    logger.error({ err }, "health: redis check failed");
  }
  const allOk = Object.values(checks).every((v) => v === "ok");
  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Sentry request handler — should come before the error handler
if (sentryEnabled) {
  Sentry.setupExpressErrorHandler(app);
}

// Centralised error handler — logs structured error and avoids leaking stacks
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, "unhandled request error");
  if (res.headersSent) return;
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message,
  });
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandled promise rejection");
  if (sentryEnabled) Sentry.captureException(reason);
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  if (sentryEnabled) Sentry.captureException(err);
});

app.listen(Number(PORT), "0.0.0.0", () => {
  logger.info({ port: PORT }, "backend started");
});
