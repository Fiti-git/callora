import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Single shared ioredis client for platform-service. BullMQ requires
// `maxRetriesPerRequest: null` for blocking commands.
export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisConnection.on("error", (err: Error) => {
  console.error("[platform-service] Redis connection error:", err);
});
