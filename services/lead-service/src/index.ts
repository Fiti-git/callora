import "dotenv/config";
import express from "express";
import cors from "cors";
import leadsRouter from "./routes/leads.js";
import blacklistRouter from "./routes/blacklist.js";
import internalRouter from "./routes/internal.js";
import { authenticate } from "./middleware/requireAuth.js";

const app = express();
const PORT = Number(process.env.PORT) || 4003;
const SERVICE = "lead-service";

app.use(
  cors({
    origin: process.env.TENANT_APP_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ service: SERVICE, status: "ok" }));

// Auth is applied inside each tenant router via router.use(authenticate).
app.use("/api/leads", leadsRouter);
app.use("/api/blacklist", blacklistRouter);
app.use("/internal", internalRouter);

void authenticate;

app.listen(PORT, () =>
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`)
);
