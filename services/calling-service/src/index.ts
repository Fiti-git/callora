import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") startOtel({ serviceName: "calling-service" });

import "./lib/env.js"; // boot-time env validation, fails loud on missing vars
import { createApp } from "./app.js";
import {
  startNumbersWorker,
  scheduleWeeklyPoolRotation,
} from "./workers/numbersWorker.js";

const app = createApp();
const PORT = Number(process.env.PORT) || 4004;
const SERVICE = "calling-service";

if (process.env.NODE_ENV !== "test") {
  startNumbersWorker();
  scheduleWeeklyPoolRotation().catch((err) => {
    console.error(
      `[${SERVICE}] failed to schedule weekly pool rotation:`,
      err?.message
    );
  });
}

app.listen(PORT, () => {
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`);
});
