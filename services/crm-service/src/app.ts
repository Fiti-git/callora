import express, { type Express } from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";
import contactsRouter from "./routes/contacts.js";
import notesRouter from "./routes/notes.js";
import tasksRouter from "./routes/tasks.js";
import dealsRouter from "./routes/deals.js";
import privacyRouter from "./routes/privacy.js";
import webhooksRouter from "./routes/webhooks.js";

export function createApp(): Express {
  const app = express();
  app.use(
    cors({
      origin: process.env.TENANT_APP_ORIGIN || "http://localhost:3000",
      credentials: true,
    })
  );
  app.use(express.json({ limit: "5mb" }));

  app.get(
    "/health",
    makeHealthHandler({
      serviceName: "crm-service",
      pingDb: () => prisma.$queryRaw`SELECT 1`,
    })
  );

  app.use("/api/contacts", contactsRouter);
  app.use("/api/notes", notesRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/deals", dealsRouter);
  app.use("/api/privacy", privacyRouter);
  app.use("/api/webhooks", webhooksRouter);
  return app;
}

export { contactsRouter, notesRouter, tasksRouter, dealsRouter, privacyRouter, webhooksRouter };
