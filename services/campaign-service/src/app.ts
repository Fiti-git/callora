import express, { type Express } from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";
import { Redis } from "ioredis";
import campaignsRouter from "./routes/campaigns.js";
import settingsRouter from "./routes/settings.js";
import { ensureCallWindowDefaults } from "./lib/tcpaSeed.js";

let healthRedis: Redis | null = null;
let seeded = false;

/**
 * Builds the campaign-service Express app. Workers are NOT started here —
 * the standalone server (`index.ts`) and the compact `core` bundle each
 * import `./workers/index.js` separately so they can opt in/out.
 */
export function createApp(): Express {
  if (!healthRedis) {
    healthRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }
  if (!seeded) {
    seeded = true;
    ensureCallWindowDefaults().catch((err) =>
      console.error("[campaign-service] ensureCallWindowDefaults failed:", err)
    );
  }

  const app = express();
  app.use(
    cors({
      origin: process.env.TENANT_APP_ORIGIN || "http://localhost:3000",
      credentials: true,
    })
  );
  app.use(express.json({ limit: "10mb" }));

  app.get(
    "/health",
    makeHealthHandler({
      serviceName: "campaign-service",
      pingDb: () => prisma.$queryRaw`SELECT 1`,
      pingQueue: () => healthRedis!.ping(),
    })
  );

  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/settings", settingsRouter);
  return app;
}

export { default as campaignsRouter } from "./routes/campaigns.js";
export { default as settingsRouter } from "./routes/settings.js";
