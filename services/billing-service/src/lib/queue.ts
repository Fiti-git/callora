import { Queue } from "bullmq";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisConnection.on("error", (err: Error) => {
  console.error("[billing] Redis connection error:", err);
});

/**
 * Queue used for billing-side scheduled jobs (usage reporting, future:
 * dunning, suspension sweeps, etc).
 */
export const billingQueue = new Queue("billing-jobs", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 1,
  },
});
