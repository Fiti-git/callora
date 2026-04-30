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
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 1,
  },
});

/**
 * Publish a real-time campaign progress event. Mirrors the helper in
 * backend/src/lib/queue.ts so the SSE endpoint sees events from both
 * monolith and microservice workers on the same channel.
 */
export async function publishCampaignProgress(
  campaignId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await redisConnection.publish(
      `campaign:${campaignId}:progress`,
      JSON.stringify({ ...payload, ts: Date.now() })
    );
  } catch (err) {
    console.error(
      `[publishCampaignProgress] failed for ${campaignId}:`,
      err
    );
  }
}
