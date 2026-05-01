/**
 * Callora compact deploy — `edge` bundle.
 *
 * Single Node process exposing port 4000 to the public internet:
 *   - api-gateway: rate limiting, CORS, helmet, JWT validation, proxies to
 *                  the `core` and `io` bundles for tenant routes.
 *   - auth-service: mounted in-process at /api/auth (no proxy hop).
 *   - platform-service: mounted in-process at /api/platform.
 *
 * Stripe webhook (/api/billing/webhook) is proxied to the io bundle
 * BEFORE express.json() so the raw body survives signature verification.
 */
import "dotenv/config";

import express, { type RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import {
  createProxyMiddleware,
  type Options,
} from "http-proxy-middleware";
import {
  logger,
  registry,
  requestIdMiddleware,
  httpMetricsMiddleware,
  PROM_CONTENT_TYPE,
} from "@callora/shared";

// In-process service apps (no HTTP hop).
import { createApp as createAuthApp } from "@callora/auth-service/dist/app.js";
import {
  developerKeysRouter,
  meRouter,
  auditLogRouter,
} from "@callora/auth-service/dist/app.js";
import { createApp as createPlatformApp } from "@callora/platform-service/dist/app.js";
// Tenant JWT validation middleware — reused from api-gateway.
import tenantAuth from "@callora/api-gateway/dist/middleware/tenantAuth.js";

const app = express();
const SERVICE = "callora-edge";
const PORT = Number(process.env.PORT) || 4000;

app.set("trust proxy", 1);
app.use(requestIdMiddleware as unknown as RequestHandler);
app.use(httpMetricsMiddleware as unknown as RequestHandler);
app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", PROM_CONTENT_TYPE);
  res.send(await registry.metrics());
});
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// ---- Downstream bundle URLs (compact topology) ---------------------------
const CORE_URL = process.env.CORE_BUNDLE_URL || "http://core:4002";
const IO_URL = process.env.IO_BUNDLE_URL || "http://io:4004";

// ---- Rate limits ---------------------------------------------------------
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
const platformLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// ---- CORS ----------------------------------------------------------------
const TENANT_APP_ORIGIN =
  process.env.TENANT_APP_ORIGIN || "http://localhost:3000";
const ADMIN_APP_ORIGIN =
  process.env.ADMIN_APP_ORIGIN || "http://localhost:3001";
const allowedOrigins = new Set([TENANT_APP_ORIGIN, ADMIN_APP_ORIGIN]);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ---- Bundle health -------------------------------------------------------
app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: SERVICE, ts: new Date().toISOString() })
);

// ---- Stripe webhook proxy (RAW body, BEFORE any json parser) ------------
const stripeWebhookProxy: Options = {
  target: IO_URL,
  changeOrigin: true,
};
app.post(
  "/api/billing/webhook",
  createProxyMiddleware(stripeWebhookProxy) as unknown as RequestHandler
);

// ---- In-process apps (auth + platform) -----------------------------------
// Both sub-apps install their own express.json(); mounting them BEFORE we
// add a global json() prevents double-parsing on tenant routes.
// Mount sub-apps at `/`. Each sub-app already self-prefixes its routes
// with /api/auth or /api/platform inside createApp(); mounting here at the
// same prefix would double it (e.g. /api/platform/api/platform/auth/login).
app.use(authLimiter, createAuthApp());
app.use(platformLimiter, createPlatformApp());

// Developer API key CRUD — JWT-protected, mounted in-process from
// auth-service. Uses the same JSON parser the auth sub-app installs.
app.use(
  "/api/developer",
  apiLimiter,
  tenantAuth,
  express.json(),
  developerKeysRouter as unknown as RequestHandler
);

// /api/me — in-process from auth-service. NO tenantAuth here: the router
// uses its own permissive auth so PAST_DUE/SUSPENDED orgs can keep polling
// status + onboarding state.
app.use(
  "/api/me",
  apiLimiter,
  express.json(),
  meRouter as unknown as RequestHandler
);

// Tenant audit-log viewer — in-process from auth-service.
app.use(
  "/api/audit-log",
  apiLimiter,
  tenantAuth,
  express.json(),
  auditLogRouter as unknown as RequestHandler
);

// JSON parser for everything else (proxied tenant routes).
app.use(express.json());

// ---- Tenant proxy targets (core / io) -----------------------------------
const tenantProxy = (target: string): RequestHandler =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
  }) as unknown as RequestHandler;

// core bundle: campaigns, leads, crm, analytics, settings, blacklist, privacy
app.use("/api/campaigns", apiLimiter, tenantAuth, tenantProxy(CORE_URL));
app.use("/api/leads", apiLimiter, tenantAuth, tenantProxy(CORE_URL));
app.use("/api/contacts", apiLimiter, tenantAuth, tenantProxy(CORE_URL));
app.use("/api/notes", apiLimiter, tenantAuth, tenantProxy(CORE_URL));
app.use("/api/tasks", apiLimiter, tenantAuth, tenantProxy(CORE_URL));
app.use("/api/deals", apiLimiter, tenantAuth, tenantProxy(CORE_URL));
app.use("/api/stats", apiLimiter, tenantAuth, tenantProxy(CORE_URL));
app.use("/api/analytics", apiLimiter, tenantAuth, tenantProxy(CORE_URL));
app.use("/api/settings", apiLimiter, tenantAuth, tenantProxy(CORE_URL));
app.use("/api/blacklist", apiLimiter, tenantAuth, tenantProxy(CORE_URL));
// GDPR export + delete (lives in crm-service, part of core bundle).
app.use("/api/privacy", apiLimiter, tenantAuth, tenantProxy(CORE_URL));

// io bundle: vapi (calling), billing, demo, compliance
app.use("/api/vapi", apiLimiter, tenantAuth, tenantProxy(IO_URL));
app.use("/api/billing", apiLimiter, tenantAuth, tenantProxy(IO_URL));
// Demo + TCPA/CAN-SPAM compliance both live in calling-service (io bundle).
app.use("/api/demo", apiLimiter, tenantAuth, tenantProxy(IO_URL));
app.use("/api/compliance", apiLimiter, tenantAuth, tenantProxy(IO_URL));

// Public API v1 lives in lead-service (core bundle). Auth is via the
// publishable api-key inside the service — no tenantAuth here so the
// `cal_*` bearer token isn't rejected by the JWT middleware.
app.use("/api/v1", apiLimiter, tenantProxy(CORE_URL));

// Email compliance + email marketing live in notification-service (io bundle).
// The unsubscribe endpoints under /api/email carry their own JWT (no bearer
// auth), so we proxy without tenantAuth. The /api/email-marketing/* tree is
// JWT-bearer authenticated INSIDE notification-service.
app.use("/api/email-marketing", apiLimiter, tenantAuth, tenantProxy(IO_URL));
app.use("/api/email", apiLimiter, tenantProxy(IO_URL));

// Tenant outbound webhook management lives in crm-service (core bundle).
app.use("/api/webhooks", apiLimiter, tenantProxy(CORE_URL));

app.listen(PORT, () => {
  logger.info({ service: SERVICE, port: PORT }, `[Callora] ${SERVICE} listening`);
});
