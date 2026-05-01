// Platform-service worker entrypoint. Boots BullMQ workers + scheduled jobs
// owned by platform-service (currently: anomaly detection).
//
// Run alongside the HTTP server in production:
//   node dist/worker.js
//
// Kept as a separate process so worker concurrency / restarts do not affect
// the admin-facing HTTP API.

import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") {
  startOtel({ serviceName: "platform-service-worker" });
}

import { startAnomalyWorker } from "./risk/anomalyWorker.js";

const worker = startAnomalyWorker();

console.log("[Callora] platform-service worker started (anomaly scanner)");

const shutdown = async (sig: string) => {
  console.log(`[platform-worker] received ${sig}, shutting down`);
  try {
    await worker.close();
  } catch (err) {
    console.error("[platform-worker] error during shutdown:", err);
  }
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
