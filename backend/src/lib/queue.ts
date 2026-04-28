import { Queue } from "bullmq";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisConnection.on("error", (err: Error) => {
  console.error("Redis connection error:", err);
});

export const callQueue = new Queue("campaign-calls", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: false, // keep failed jobs forever for inspection
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
  },
});

// Dead-letter queue — jobs that exhaust all retries are pushed here for triage.
// removeOnFail:false on the source queue already retains them; this DLQ gives
// us a separate stream for alerting + manual replay.
export const deadLetterQueue = new Queue("campaign-calls-dlq", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
    attempts: 1,
  },
});
