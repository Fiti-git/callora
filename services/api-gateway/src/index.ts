import "dotenv/config";
import { startOtel, makeHealthHandler } from "./observability";
startOtel("api-gateway");

import express, { type RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware, type Options } from "http-proxy-middleware";
import tenantAuth from "./middleware/tenantAuth";
import {
  signupIpLimiter,
  forgotPasswordIpLimiter,
} from "./middleware/rateLimitIp";
import {
  campaignsHourLimiter,
  callsMinuteLimiter,
} from "./middleware/rateLimitOrg";
import { spendCap } from "./middleware/spendCap";

const app = express();
const SERVICE = "api-gateway";
const PORT = Number(process.env.PORT) || 4000;

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

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

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://auth-service:4001";
const CAMPAIGN_SERVICE_URL =
  process.env.CAMPAIGN_SERVICE_URL || "http://campaign-service:4002";
const LEAD_SERVICE_URL =
  process.env.LEAD_SERVICE_URL || "http://lead-service:4003";
const CALLING_SERVICE_URL =
  process.env.CALLING_SERVICE_URL || "http://calling-service:4004";
const CRM_SERVICE_URL =
  process.env.CRM_SERVICE_URL || "http://crm-service:4005";
const BILLING_SERVICE_URL =
  process.env.BILLING_SERVICE_URL || "http://billing-service:4006";
const PLATFORM_SERVICE_URL =
  process.env.PLATFORM_SERVICE_URL || "http://platform-service:4007";
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || "http://notification-service:4008";
const ANALYTICS_SERVICE_URL =
  process.env.ANALYTICS_SERVICE_URL || "http://analytics-service:4009";

const TENANT_APP_ORIGIN =
  process.env.TENANT_APP_ORIGIN || "http://localhost:3000";
const ADMIN_APP_ORIGIN =
  process.env.ADMIN_APP_ORIGIN || "http://localhost:3001";

// CORS — allow tenant + admin origins with credentials
const allowedOrigins = new Set([TENANT_APP_ORIGIN, ADMIN_APP_ORIGIN]);
app.use(
  cors({
    origin: (origin, callback) => {
      // allow non-browser requests (no origin) and whitelisted origins
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// Health check (before any auth). The gateway doesn't own DB/queue itself,
// so it just reports its own uptime + version.
app.get("/health", makeHealthHandler({ serviceName: SERVICE }));

// ---------------------------------------------------------------------------
// Stripe webhook MUST be proxied with the raw body intact.
// http-proxy-middleware streams the request body without parsing, so
// registering this proxy BEFORE express.json() preserves the raw bytes
// required for Stripe's signature verification in billing-service.
// ---------------------------------------------------------------------------
const stripeWebhookProxy: Options = {
  target: BILLING_SERVICE_URL,
  changeOrigin: true,
  // Preserve original path (/api/billing/webhook).
};
app.post(
  "/api/billing/webhook",
  createProxyMiddleware(stripeWebhookProxy) as unknown as RequestHandler
);

// ---------------------------------------------------------------------------
// Resend webhook MUST also be proxied with the raw body intact (HMAC sig).
// Same pattern as Stripe — register BEFORE express.json().
// ---------------------------------------------------------------------------
const resendWebhookProxy: Options = {
  target: NOTIFICATION_SERVICE_URL,
  changeOrigin: true,
};
app.post(
  "/api/email/webhook/resend",
  createProxyMiddleware(resendWebhookProxy) as unknown as RequestHandler
);

// JSON parsing for everything else
app.use(express.json());

// ---------------------------------------------------------------------------
// Platform routes — NO tenant JWT check. The platform-service uses its own
// PLATFORM_JWT_SECRET and verifies platform-admin tokens internally.
// ---------------------------------------------------------------------------
app.use(
  "/api/platform",
  platformLimiter,
  createProxyMiddleware({
    target: PLATFORM_SERVICE_URL,
    changeOrigin: true,
  }) as unknown as RequestHandler
);

// ---------------------------------------------------------------------------
// Tenant routes — require a valid tenant JWT. The middleware verifies the
// bearer token and forwards x-user-id / x-organization-id / x-user-role
// headers downstream so each microservice trusts the gateway's decision.
// ---------------------------------------------------------------------------
const tenantProxy = (target: string): RequestHandler =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
  }) as unknown as RequestHandler;

// Per-IP rate limits on signup + password-reset BEFORE the generic /api/auth proxy.
// These only run for the specific paths/methods.
app.post("/api/auth/register", signupIpLimiter);
app.post("/api/auth/forgot-password", forgotPasswordIpLimiter);

app.use("/api/auth", authLimiter, tenantProxy(AUTH_SERVICE_URL));

// /api/me lives in auth-service. It uses its OWN permissive auth so that
// PAST_DUE/SUSPENDED orgs can still poll status + onboarding state — we do
// not run tenantAuth here (which would 402 those orgs).
app.use("/api/me", apiLimiter, tenantProxy(AUTH_SERVICE_URL));

// Tenant audit-log viewer (org-scoped reads) — lives in auth-service since
// it's an account-level read with no domain dependencies.
app.use("/api/audit-log", apiLimiter, tenantAuth, tenantProxy(AUTH_SERVICE_URL));

// Tenant-facing developer API key CRUD lives in auth-service. JWT-protected:
// only the tenant who owns the key can list/create/revoke their own keys.
app.use(
  "/api/developer",
  apiLimiter,
  tenantAuth,
  tenantProxy(AUTH_SERVICE_URL)
);

// Public API v1 — external integrations (Zapier-style). Auth is via the
// tenant's publishable API key (`cal_*`), validated INSIDE lead-service.
// We deliberately do NOT run tenantAuth here (it would reject the api-key
// bearer token); the gateway just rate-limits + proxies.
app.use("/api/v1", apiLimiter, tenantProxy(LEAD_SERVICE_URL));

// Campaigns: per-org hourly cap on POST (campaign creation) + spend cap on
// "campaign-run" trigger endpoint.
app.use(
  "/api/campaigns",
  apiLimiter,
  tenantAuth,
  campaignsHourLimiter,
  spendCap({ action: "campaign-run" }),
  tenantProxy(CAMPAIGN_SERVICE_URL)
);

// Leads: spend cap on lead-scrape POST.
app.use(
  "/api/leads",
  apiLimiter,
  tenantAuth,
  spendCap({ action: "lead-scrape" }),
  tenantProxy(LEAD_SERVICE_URL)
);

// Vapi/calling: per-minute call cap + spend cap on call-trigger POST.
app.use(
  "/api/vapi",
  apiLimiter,
  tenantAuth,
  callsMinuteLimiter,
  spendCap({ action: "call-trigger" }),
  tenantProxy(CALLING_SERVICE_URL)
);

// One-shot demo call flow lives in calling-service.
app.use(
  "/api/demo",
  apiLimiter,
  tenantAuth,
  callsMinuteLimiter,
  spendCap({ action: "call-trigger" }),
  tenantProxy(CALLING_SERVICE_URL)
);

// TCPA/CAN-SPAM compliance routes (DNC + email suppressions).
app.use("/api/compliance", apiLimiter, tenantAuth, tenantProxy(CALLING_SERVICE_URL));

// CRM service hosts multiple resource paths
app.use("/api/contacts", apiLimiter, tenantAuth, tenantProxy(CRM_SERVICE_URL));
app.use("/api/notes", apiLimiter, tenantAuth, tenantProxy(CRM_SERVICE_URL));
app.use("/api/tasks", apiLimiter, tenantAuth, tenantProxy(CRM_SERVICE_URL));
app.use("/api/deals", apiLimiter, tenantAuth, tenantProxy(CRM_SERVICE_URL));
// GDPR export + delete live next to the tenant CRUD they touch.
app.use("/api/privacy", apiLimiter, tenantAuth, tenantProxy(CRM_SERVICE_URL));

// Remaining /api/billing/* (webhook already handled above)
app.use("/api/billing", apiLimiter, tenantAuth, tenantProxy(BILLING_SERVICE_URL));

// Analytics
app.use("/api/stats", apiLimiter, tenantAuth, tenantProxy(ANALYTICS_SERVICE_URL));
app.use("/api/analytics", apiLimiter, tenantAuth, tenantProxy(ANALYTICS_SERVICE_URL));
app.use("/api/settings", apiLimiter, tenantAuth, tenantProxy(CAMPAIGN_SERVICE_URL));
app.use("/api/blacklist", apiLimiter, tenantAuth, tenantProxy(LEAD_SERVICE_URL));

// Email compliance + email marketing live on notification-service.
// `/api/email/webhook/resend` is already proxied above (raw body) — these
// JSON-bodied routes are mounted after express.json().
//   - /api/email/unsubscribe (GET/POST)
//   - /api/email-marketing/{campaigns,lists,templates,automations,...}
// The unsubscribe endpoints carry their own JWT (no bearer auth), so we
// proxy without tenantAuth. The /api/email-marketing/* tree is JWT-bearer
// authenticated INSIDE notification-service, so we still attach tenantAuth
// at the gateway for consistency + rate limiting.
app.use(
  "/api/email-marketing",
  apiLimiter,
  tenantAuth,
  tenantProxy(NOTIFICATION_SERVICE_URL)
);
app.use("/api/email", apiLimiter, tenantProxy(NOTIFICATION_SERVICE_URL));

// Tenant outbound webhook management lives in crm-service (CRM events out).
app.use(
  "/api/webhooks",
  apiLimiter,
  tenantProxy(CRM_SERVICE_URL)
);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`);
});
