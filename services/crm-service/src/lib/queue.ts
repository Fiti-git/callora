import { Queue } from "bullmq";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisConnection.on("error", (err: Error) => {
  console.error("[crm-service] Redis connection error:", err);
});

/**
 * Outbound tenant-webhook delivery queue. Mirrors backend/src/lib/queue.ts so
 * the webhookDeliveryWorker (Agent 5E) can pick jobs off the same queue
 * regardless of which service enqueued them.
 */
export const tenantWebhookQueue = new Queue("tenant-webhook-deliveries", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
  },
});
