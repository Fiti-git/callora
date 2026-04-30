import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") startOtel({ serviceName: "crm-service" });

import express from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";
import contactsRouter from "./routes/contacts.js";
import notesRouter from "./routes/notes.js";
import tasksRouter from "./routes/tasks.js";
import dealsRouter from "./routes/deals.js";

const app = express();
const PORT = Number(process.env.PORT) || 4005;
const SERVICE = "crm-service";

app.use(cors({ origin: process.env.TENANT_APP_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "5mb" }));

app.get(
  "/health",
  makeHealthHandler({
    serviceName: SERVICE,
    pingDb: () => prisma.$queryRaw`SELECT 1`,
  })
);

app.use("/api/contacts", contactsRouter);
app.use("/api/notes", notesRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/deals", dealsRouter);

app.listen(PORT, () => console.log(`[Callora] ${SERVICE} listening on port ${PORT}`));
