// OTel must be imported BEFORE anything that gets monkey-patched (express,
// http, prisma client). Bootstrap is gated against NODE_ENV=test so vitest
// runs aren't slowed down by the SDK.
import { startOtel } from "./lib/otel.js";
if (process.env.NODE_ENV !== "test") startOtel();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import dotenv from "dotenv";

dotenv.config();

// Validate required env vars at boot (throws if missing).
import "./lib/env.js";

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
import vapiWebhookRoutes from "./routes/vapi-webhook.js";
import contactsRoutes from "./routes/contacts.js";
import notesRoutes from "./routes/notes.js";
import tasksRoutes from "./routes/tasks.js";
import dealsRoutes from "./routes/deals.js";
import demoRoutes from "./routes/demo.js";
import privacyRoutes from "./routes/privacy.js";
import auditLogRoutes from "./routes/auditLog.js";
import platformAuthRoutes from "./routes/platform/auth.js";
import platformOrgsRoutes from "./routes/platform/organizations.js";
import platformPlansRoutes from "./routes/platform/plans.js";
import platformMetricsRoutes from "./routes/platform/metrics.js";
import platformAuditRoutes from "./routes/platform/audit.js";
import platformImpersonateRoutes from "./routes/platform/impersonate.js";
import platformQuotaCreditRoutes from "./routes/platform/quotaCredit.js";
import platformMrrRoutes from "./routes/platform/mrr.js";
import platformEmailsRoutes from "./routes/platform/emails.js";
import platformDlqRoutes from "./routes/platform/dlq.js";
import platformProvisioningRoutes from "./routes/platform/provisioning.js";
import billingRoutes from "./routes/billing.js";
import meRoutes from "./routes/me.js";
import complianceRoutes from "./routes/compliance.js";
import emailRoutes from "./routes/email.js";
import resendWebhookRoutes from "./routes/resendWebhook.js";
import emailMarketingRoutes from "./routes/emailMarketing.js";
import webhooksRoutes from "./routes/webhooks.js";
import publicV1Routes from "./routes/publicV1.js";
import developerKeysRoutes from "./routes/developerKeys.js";
import "./workers/index.js";
import { ensureCallWindowDefaults } from "./lib/tcpaSeed.js";
import { orgRateLimit } from "./middleware/orgRateLimit.js";

// Idempotent TCPA call-window seed.
ensureCallWindowDefaults().catch((err) =>
  logger.error({ err }, "ensureCallWindowDefaults failed"),
);

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

// CRITICAL: Stripe webhook needs raw body for signature verification. Do NOT move below express.json(). See stripe-webhook-mount-order.test.ts.
// Billing router first — its /webhook path uses raw body (Stripe signature verification)
app.use("/api/billing", billingRoutes);

// Vapi webhook: mounted BEFORE express.json() so the route can verify the
// HMAC signature against the raw request body.
app.use("/api/vapi", vapiWebhookRoutes);

// Resend webhook: also raw-body. Mounted before express.json() — the route
// uses express.raw() locally to capture the signed payload.
app.use("/api/email", resendWebhookRoutes);

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
// Spec-required alias — the GDPR endpoints live under `/api/gdpr/*` per the
// product spec, with `/api/privacy/*` retained for backward compatibility.
app.use("/api/gdpr", apiLimiter, privacyRoutes);
app.use("/api/audit-log", apiLimiter, auditLogRoutes);
// /me/status — permissive auth (allows PAST_DUE/SUSPENDED through) so the
// dashboard layout can fetch org status to render the failed-payment banner.
app.use("/api/me", apiLimiter, meRoutes);
app.use("/api/compliance", apiLimiter, complianceRoutes);
// Tenant-facing email routes (unsubscribe). Webhook is registered above
// before express.json(); these routes need json parsing.
app.use("/api/email", apiLimiter, emailRoutes);
app.use("/api/email-marketing", apiLimiter, emailMarketingRoutes);
// Phase 3 Agent 12 — integrations.
app.use("/api/webhooks", apiLimiter, webhooksRoutes);
// /api/v1 is the public API surface — keep both the IP-keyed `apiLimiter`
// and the per-org limiter so a noisy tenant can't blow through their
// budget by spreading requests across many source IPs.
app.use("/api/v1", apiLimiter, orgRateLimit({ name: "publicV1", points: 60, duration: 60 }), publicV1Routes);
app.use("/api/developer", apiLimiter, developerKeysRoutes);

// Platform (super-admin) API routes — separate, lower-volume limiter
const platformLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });
app.use("/api/platform/auth", authLimiter, platformAuthRoutes);
app.use("/api/platform/organizations", platformLimiter, platformOrgsRoutes);
app.use("/api/platform/plans", platformLimiter, platformPlansRoutes);
app.use("/api/platform/metrics", platformLimiter, platformMetricsRoutes);
app.use("/api/platform/audit", platformLimiter, platformAuditRoutes);
app.use("/api/platform/audit-log", platformLimiter, platformAuditRoutes);
app.use("/api/platform/impersonate", platformLimiter, platformImpersonateRoutes);
app.use("/api/platform/orgs", platformLimiter, platformQuotaCreditRoutes);
app.use("/api/platform/metrics/mrr", platformLimiter, platformMrrRoutes);
app.use("/api/platform/emails", platformLimiter, platformEmailsRoutes);
app.use("/api/platform/dlq", platformLimiter, platformDlqRoutes);
// Phase 5 Agent M4 — hosted-tier provisioning retry endpoint. Mounted under
// /api/platform/organizations so the path is
// POST /api/platform/organizations/:orgId/provisioning/retry.
app.use("/api/platform/organizations", platformLimiter, platformProvisioningRoutes);

// Health check — verifies DB + Redis connectivity. Always returns HTTP 200;
// the body's `status` field is the readiness signal. Container orchestrators
// must parse the JSON and assert `status === "ok"`.
app.get("/health", async (_req, res) => {
  let db: "ok" | "error" = "ok";
  let queue: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    db = "error";
    logger.error({ err }, "health: database check failed");
  }
  try {
    const pong = await redisConnection.ping();
    if (pong !== "PONG") queue = "error";
  } catch (err) {
    queue = "error";
    logger.error({ err }, "health: redis check failed");
  }
  const status: "ok" | "degraded" =
    db === "error" || queue === "error" ? "degraded" : "ok";
  const version =
    process.env.GIT_SHA || process.env.npm_package_version || "unknown";
  res.status(200).json({
    status,
    uptime: Math.round(process.uptime()),
    db,
    queue,
    version,
    service: "callora-backend",
  });
});

// Sentry request handler — should come before the error handler
if (sentryEnabled) {
  Sentry.setupExpressErrorHandler(app);
}

// Centralised error handler — logs structured error and avoids leaking stacks.
// Surfaces typed quota / seat-limit errors with rich JSON bodies so the
// frontend can show the user *which* limit was hit and at what number.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, "unhandled request error");
  if (res.headersSent) return;

  if (err?.name === "QuotaExceededError") {
    return res.status(429).json({
      error: "quota_exceeded",
      message: err.message,
      kind: err.kind,
      current: err.current,
      limit: err.limit,
      units: err.units,
    });
  }
  if (err?.name === "SeatLimitExceededError") {
    return res.status(402).json({
      error: "seat_limit_exceeded",
      message: err.message,
      current: err.current,
      limit: err.limit,
    });
  }

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
