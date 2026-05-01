import express, { type Express } from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";
import leadsRouter from "./routes/leads.js";
import blacklistRouter from "./routes/blacklist.js";
import internalRouter from "./routes/internal.js";
import publicV1Router from "./routes/publicV1.js";

export function createApp(): Express {
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
      serviceName: "lead-service",
      pingDb: () => prisma.$queryRaw`SELECT 1`,
    })
  );

  app.use("/api/leads", leadsRouter);
  app.use("/api/blacklist", blacklistRouter);
  app.use("/api/v1", publicV1Router);
  app.use("/internal", internalRouter);
  return app;
}

export {
  leadsRouter,
  blacklistRouter,
  internalRouter as leadInternalRouter,
  publicV1Router,
};
