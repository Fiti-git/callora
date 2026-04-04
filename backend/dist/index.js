import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import settingsRoutes from "./routes/settings.js";
import campaignsRoutes from "./routes/campaigns.js";
import leadsRoutes from "./routes/leads.js";
import statsRoutes from "./routes/stats.js";
import blacklistRoutes from "./routes/blacklist.js";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;
app.use(cors());
app.use(express.json());
// Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
// Routes
app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/blacklist", blacklistRoutes);
// Health Check
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date() });
});
app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🚀 Backend running on http://0.0.0.0:${PORT}`);
});
