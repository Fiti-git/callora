import express, { type Express, type Router } from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";
import vapiSyncRouter from "./routes/vapi-sync.js";
import internalRouter from "./routes/internal.js";
import webhookRouter from "./routes/webhook.js";
import demoRouter from "./routes/demo.js";
import complianceRouter from "./routes/compliance.js";
import { authenticate } from "./middleware/requireAuth.js";

/**
 * Mounts the public Vapi webhook handler. MUST be called BEFORE any
 * `express.json()` middleware on the target app — the webhook router
 * uses `express.raw()` internally to verify the HMAC signature.
 */
export function mountVapiWebhook(app: Express): void {
  app.use("/api/vapi", webhookRouter);
}

/**
 * Mounts the JSON-bodied calling routes (manual sync + internal RPC).
 * Call this AFTER `express.json()` is in place.
 */
export function mountCallingRoutes(app: Express): void {
  app.use("/api/vapi", authenticate, vapiSyncRouter);
  app.use("/api/demo", demoRouter);
  app.use("/api/compliance", complianceRouter);
  app.use("/internal", internalRouter);
}

export function createApp(): Express {
  const app = express();
  app.use(
    cors({
      origin: process.env.TENANT_APP_ORIGIN || "http://localhost:3000",
      credentials: true,
    })
  );
  // Webhook FIRST (raw body for HMAC).
  mountVapiWebhook(app);
  app.use(express.json({ limit: "5mb" }));
  app.get(
    "/health",
    makeHealthHandler({
      serviceName: "calling-service",
      pingDb: () => prisma.$queryRaw`SELECT 1`,
    })
  );
  mountCallingRoutes(app);
  return app;
}

export {
  webhookRouter as callingWebhookRouter,
  vapiSyncRouter,
  internalRouter as callingInternalRouter,
  demoRouter,
  complianceRouter,
};
export type { Router };
