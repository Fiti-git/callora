import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") startOtel({ serviceName: "campaign-service" });

import "./lib/env.js"; // boot-time env validation, fails loud on missing vars
import { createApp } from "./app.js";
import "./workers/index.js"; // boot BullMQ workers in the standalone server

const app = createApp();
const PORT = Number(process.env.PORT) || 4002;
const SERVICE = "campaign-service";

app.listen(PORT, () =>
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`)
);
