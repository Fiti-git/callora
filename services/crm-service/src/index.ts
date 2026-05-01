import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") startOtel({ serviceName: "crm-service" });

import { createApp } from "./app.js";

const app = createApp();
const PORT = Number(process.env.PORT) || 4005;
const SERVICE = "crm-service";

app.listen(PORT, () =>
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`)
);

if (process.env.NODE_ENV !== "test") {
  import("./workers/index.js").catch((err) =>
    console.error("[crm-service] failed to start workers:", err)
  );
}
