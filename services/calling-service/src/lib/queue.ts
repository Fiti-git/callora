import { Queue } from "bullmq";
import { Redis } from "ioredis";

/**
 * BullMQ producer for calling-service. The webhook handler enqueues
 * `callCompleted` jobs onto the shared `campaign-calls` queue, which is
 * consumed by campaign-service workers.
 */

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisConnection.on("error", (err: Error) => {
  console.error("[calling-service] Redis connection error:", err);
});

// IMPORTANT: queue name must match the consumer worker in campaign-service
// (services/campaign-service/src/workers/index.ts).
export const callQueue = new Queue("campaign-calls", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
  },
});
