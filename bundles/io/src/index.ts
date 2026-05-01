/**
 * Callora compact deploy — `io` bundle.
 *
 * Single Node process for external-IO services:
 *   - calling-service: Vapi outbound + public webhook (raw body, HMAC)
 *   - billing-service: Stripe Checkout/Portal + webhook (raw body, sig)
 *   - notification-service: SMTP send (/internal/send-email)
 *
 * Listens on PORT (default 4004). Sits behind the edge bundle.
 *
 * CRITICAL ORDERING: BOTH webhook routes (Vapi + Stripe) are mounted
 * BEFORE any express.json() middleware so the raw request bytes survive
 * for HMAC/signature verification.
 */
import "dotenv/config";

import express, { type RequestHandler } from "express";
import cors from "cors";
import {
  logger,
  registry,
  requestIdMiddleware,
  httpMetricsMiddleware,
  PROM_CONTENT_TYPE,
} from "@callora/shared";

import {
  mountVapiWebhook,
  mountCallingRoutes,
} from "@callora/calling-service/dist/app.js";
import {
  mountStripeWebhook,
  mountBillingRoutes,
} from "@callora/billing-service/dist/app.js";
import { createApp as createNotificationApp } from "@callora/notification-service/dist/app.js";

const app = express();
const SERVICE = "callora-io";
const PORT = Number(process.env.PORT) || 4004;

app.use(requestIdMiddleware as unknown as RequestHandler);
app.use(httpMetricsMiddleware as unknown as RequestHandler);
app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", PROM_CONTENT_TYPE);
  res.send(await registry.metrics());
});
app.use(
  cors({
    origin: process.env.TENANT_APP_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

// ---- 1. RAW-BODY webhooks first (Stripe signature + Vapi HMAC) ----------
mountStripeWebhook(app); // POST /api/billing/webhook (raw)
mountVapiWebhook(app);   // POST /api/vapi/webhook   (raw, set inside router)

// ---- 2. JSON parser for all other routes --------------------------------
app.use(express.json({ limit: "5mb" }));

// ---- 3. Bundle-level health --------------------------------------------
app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: SERVICE, ts: new Date().toISOString() })
);

// ---- 4. Remaining JSON-bodied routes ------------------------------------
mountCallingRoutes(app); // /api/vapi/sync, /internal/...
mountBillingRoutes(app); // /api/billing/*, /internal/...
app.use(createNotificationApp()); // exposes /internal/send-email

const server = app.listen(PORT, () => {
  logger.info({ service: SERVICE, port: PORT }, `[Callora] ${SERVICE} listening`);
});

// Boot workers AFTER server up.
async function bootWorkers() {
  try {
    const { startNumbersWorker, scheduleWeeklyPoolRotation } = await import(
      "@callora/calling-service/dist/workers/numbersWorker.js"
    );
    startNumbersWorker();
    scheduleWeeklyPoolRotation().catch((err) =>
      logger.error({ err: err?.message }, "[io] scheduleWeeklyPoolRotation failed")
    );
    logger.info("[io] calling numbersWorker booted");
  } catch (err) {
    logger.error({ err }, "[io] calling worker failed");
  }
  try {
    await import("@callora/billing-service/dist/workers/index.js");
    logger.info("[io] billing usage reporter + dunning booted");
  } catch (err) {
    logger.error({ err }, "[io] billing worker failed");
  }
  try {
    await import("@callora/notification-service/dist/workers/index.js");
    logger.info("[io] notification email-campaign + automation workers booted");
  } catch (err) {
    logger.error({ err }, "[io] notification workers failed");
  }
}
bootWorkers();

const shutdown = (sig: string) => {
  logger.info({ sig }, `[${SERVICE}] received ${sig}, draining...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
