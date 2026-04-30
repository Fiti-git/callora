import "dotenv/config";
import { startOtel, makeHealthHandler } from "./observability.js";
startOtel("notification-service");

import express from "express";
import sendRouter from "./routes/send.js";

const app = express();
const PORT = Number(process.env.PORT) || 4008;
const SERVICE = "notification-service";

app.use(express.json());

app.get("/health", makeHealthHandler({ serviceName: SERVICE }));
app.use("/internal", sendRouter);

app.listen(PORT, () => console.log(`[Callora] ${SERVICE} listening on port ${PORT}`));
