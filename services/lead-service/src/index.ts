import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") startOtel({ serviceName: "lead-service" });

import { createApp } from "./app.js";

const app = createApp();
const PORT = Number(process.env.PORT) || 4003;
const SERVICE = "lead-service";

app.listen(PORT, () =>
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`)
);
