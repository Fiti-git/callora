import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") startOtel({ serviceName: "billing-service" });

import { createApp } from "./app.js";

const app = createApp();
const PORT = Number(process.env.PORT) || 4006;
const SERVICE = "billing-service";

if (process.env.NODE_ENV !== "test") {
  import("./workers/index.js").catch((err) =>
    console.error("[billing] failed to start workers:", err)
  );
}

app.listen(PORT, () => {
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`);
});
