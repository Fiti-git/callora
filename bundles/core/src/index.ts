/**
 * Callora compact deploy — `core` bundle.
 *
 * Single Node process hosting tenant CRUD + scrape/qualify pipeline:
 *   - campaign-service routes + BullMQ workers (campaign + trial expiry)
 *   - lead-service routes
 *   - crm-service routes
 *   - analytics-service routes
 *   - platform-service anomaly worker (read-only background scan)
 *
 * Listens on PORT (default 4002). Behind the edge bundle in production.
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

import { createApp as createCampaignApp } from "@callora/campaign-service/dist/app.js";
import { createApp as createLeadApp } from "@callora/lead-service/dist/app.js";
import { createApp as createCrmApp } from "@callora/crm-service/dist/app.js";
import { createApp as createAnalyticsApp } from "@callora/analytics-service/dist/app.js";

const app = express();
const SERVICE = "callora-core";
const PORT = Number(process.env.PORT) || 4002;

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

// Bundle-level health (each sub-app also exposes /health, but the first
// registered handler wins).
app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: SERVICE, ts: new Date().toISOString() })
);

// Mount each sub-app at root. Each one already attaches its own
// express.json() and prefixes its routes with /api/<resource>.
app.use(createCampaignApp());
app.use(createLeadApp());
app.use(createCrmApp());
app.use(createAnalyticsApp());

const server = app.listen(PORT, () => {
  logger.info({ service: SERVICE, port: PORT }, `[Callora] ${SERVICE} listening`);
});

// Boot workers AFTER the HTTP server is up so /health responds during
// long worker initialisation (Redis connect, cron registration, etc.).
async function bootWorkers() {
  try {
    // campaign-service workers (campaign-calls + scheduled trial expiry)
    await import("@callora/campaign-service/dist/workers/index.js");
    logger.info("[core] campaign-service workers booted");
  } catch (err) {
    logger.error({ err }, "[core] campaign workers failed");
  }
  try {
    // platform-service anomaly scanner
    const platformRisk = await import(
      "@callora/platform-service/dist/risk/anomalyWorker.js"
    );
    if (typeof platformRisk.startAnomalyWorker === "function") {
      platformRisk.startAnomalyWorker();
      logger.info("[core] platform anomaly worker booted");
    }
  } catch (err) {
    logger.error({ err }, "[core] platform anomaly worker failed");
  }
  try {
    // crm-service tenant outbound webhook delivery worker
    await import("@callora/crm-service/dist/workers/index.js");
    logger.info("[core] crm-service tenant-webhook worker booted");
  } catch (err) {
    logger.error({ err }, "[core] crm-service tenant-webhook worker failed");
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
