import { Queue } from "bullmq";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisConnection.on("error", (err: Error) => {
  console.error("[notification-service] Redis connection error:", err);
});

// Email marketing dispatch queue. Mirrors backend/src/lib/queue.ts so the
// email-campaign worker (Agent 5E) can pick jobs off the same queue name
// regardless of which service enqueued them.
export const emailCampaignQueue = new Queue("email-campaign-dispatch", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
  },
});

export const emailAutomationQueue = new Queue("email-automation", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
  },
});

// Tenant outbound webhook queue — also referenced from notification-service
// because the resend webhook handler emits EMAIL_OPENED/EMAIL_CLICKED events
// to subscribed tenant webhooks.
export const tenantWebhookQueue = new Queue("tenant-webhook-deliveries", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
  },
});
