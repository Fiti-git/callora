import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") startOtel({ serviceName: "campaign-service" });

import "./lib/env.js"; // boot-time env validation, fails loud on missing vars
import express from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";
import { Redis } from "ioredis";
import campaignsRouter from "./routes/campaigns.js";
import settingsRouter from "./routes/settings.js";
import "./workers/index.js"; // boot BullMQ workers
import { ensureCallWindowDefaults } from "./lib/tcpaSeed.js";

// Health-check Redis client. Reused for every /health hit; ioredis is lazy
// so this constructor doesn't actually open a socket until ping().
const healthRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

// Idempotent TCPA call-window seed. Safe to run on every boot.
ensureCallWindowDefaults().catch((err) =>
  console.error("[campaign-service] ensureCallWindowDefaults failed:", err)
);

const app = express();
const PORT = Number(process.env.PORT) || 4002;
const SERVICE = "campaign-service";

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
    serviceName: SERVICE,
    pingDb: () => prisma.$queryRaw`SELECT 1`,
    pingQueue: () => healthRedis.ping(),
  })
);

// Both routers call `router.use(authenticate)` internally — do NOT add auth middleware
// at the mount point or every request would run JWT verification twice.
app.use("/api/campaigns", campaignsRouter);
app.use("/api/settings", settingsRouter);

app.listen(PORT, () =>
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`)
);
