import express, { type Express } from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";
import statsRouter from "./routes/stats.js";
import analyticsRouter from "./routes/analytics.js";

export function createApp(): Express {
  const app = express();
  app.use(
    cors({
      origin: process.env.TENANT_APP_ORIGIN || "http://localhost:3000",
      credentials: true,
    })
  );
  app.use(express.json());

  app.get(
    "/health",
    makeHealthHandler({
      serviceName: "analytics-service",
      pingDb: () => prisma.$queryRaw`SELECT 1`,
    })
  );

  app.use("/api/stats", statsRouter);
  app.use("/api/analytics", analyticsRouter);
  return app;
}

export { statsRouter, analyticsRouter };
