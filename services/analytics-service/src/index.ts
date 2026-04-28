import "dotenv/config";
import express from "express";
import cors from "cors";
import statsRouter from "./routes/stats.js";
import analyticsRouter from "./routes/analytics.js";

const app = express();
const PORT = Number(process.env.PORT) || 4009;
const SERVICE = "analytics-service";

app.use(cors({ origin: process.env.TENANT_APP_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ service: SERVICE, status: "ok" }));

app.use("/api/stats", statsRouter);
app.use("/api/analytics", analyticsRouter);

app.listen(PORT, () => console.log(`[Callora] ${SERVICE} listening on port ${PORT}`));
