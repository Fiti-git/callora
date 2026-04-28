import "dotenv/config";
import express from "express";
import cors from "cors";
import campaignsRouter from "./routes/campaigns.js";
import settingsRouter from "./routes/settings.js";
import "./workers/index.js"; // boot BullMQ workers

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

app.get("/health", (_req, res) => res.json({ service: SERVICE, status: "ok" }));

// Both routers call `router.use(authenticate)` internally — do NOT add auth middleware
// at the mount point or every request would run JWT verification twice.
app.use("/api/campaigns", campaignsRouter);
app.use("/api/settings", settingsRouter);

app.listen(PORT, () =>
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`)
);
