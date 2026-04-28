import "dotenv/config";
import express, { type RequestHandler } from "express";
import cors from "cors";
import { createProxyMiddleware, type Options } from "http-proxy-middleware";
import tenantAuth from "./middleware/tenantAuth";

const app = express();
const SERVICE = "api-gateway";
const PORT = Number(process.env.PORT) || 4000;

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

// Health check (before any auth)
app.get("/health", (_req, res) => {
  res.json({ service: SERVICE, status: "ok" });
});

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

// JSON parsing for everything else
app.use(express.json());

// ---------------------------------------------------------------------------
// Platform routes — NO tenant JWT check. The platform-service uses its own
// PLATFORM_JWT_SECRET and verifies platform-admin tokens internally.
// ---------------------------------------------------------------------------
app.use(
  "/api/platform",
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

app.use("/api/auth", tenantAuth, tenantProxy(AUTH_SERVICE_URL));
app.use("/api/campaigns", tenantAuth, tenantProxy(CAMPAIGN_SERVICE_URL));
app.use("/api/leads", tenantAuth, tenantProxy(LEAD_SERVICE_URL));
app.use("/api/vapi", tenantAuth, tenantProxy(CALLING_SERVICE_URL));

// CRM service hosts multiple resource paths
app.use("/api/contacts", tenantAuth, tenantProxy(CRM_SERVICE_URL));
app.use("/api/notes", tenantAuth, tenantProxy(CRM_SERVICE_URL));
app.use("/api/tasks", tenantAuth, tenantProxy(CRM_SERVICE_URL));
app.use("/api/deals", tenantAuth, tenantProxy(CRM_SERVICE_URL));

// Remaining /api/billing/* (webhook already handled above)
app.use("/api/billing", tenantAuth, tenantProxy(BILLING_SERVICE_URL));

// Analytics
app.use("/api/stats", tenantAuth, tenantProxy(ANALYTICS_SERVICE_URL));
app.use("/api/analytics", tenantAuth, tenantProxy(ANALYTICS_SERVICE_URL));
app.use("/api/settings", tenantAuth, tenantProxy(CAMPAIGN_SERVICE_URL));
app.use("/api/blacklist", tenantAuth, tenantProxy(LEAD_SERVICE_URL));

// Notification service is referenced for completeness but is NOT exposed
// publicly — services call it directly over the internal Docker network.
void NOTIFICATION_SERVICE_URL;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`);
});
