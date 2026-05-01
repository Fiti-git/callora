import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") startOtel({ serviceName: "auth-service" });

import { createApp } from "./app.js";

const app = createApp();
const PORT = Number(process.env.PORT) || 4001;

app.listen(PORT, () => {
  console.log(`[Callora] auth-service listening on port ${PORT}`);
});
