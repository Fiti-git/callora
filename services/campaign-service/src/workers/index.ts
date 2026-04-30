import { Worker, Job } from "bullmq";
import { callQueue, redisConnection } from "../lib/queue.js";
import { campaignWorker, CampaignCallJobData } from "./campaignWorker.js";
import { trialExpiryWorker } from "./trialExpiryWorker.js";
import { callCompletedWorker, CallCompletedJobData } from "./callCompletedWorker.js";

export const campaignCallsWorker = new Worker<any>(
  "campaign-calls",
  async (job: Job<any>) => {
    if (job.name === "processCampaignCalls") {
      return await campaignWorker(job as Job<CampaignCallJobData>);
    }
    if (job.name === "checkTrialExpiry") {
      return await trialExpiryWorker(job);
    }
    if (job.name === "callCompleted") {
      return await callCompletedWorker(job as Job<CallCompletedJobData>);
    }
    console.warn(`Unknown job name received on campaign-calls queue: ${job.name}`);
  },
  {
    connection: redisConnection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 1),
  }
);

campaignCallsWorker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} (${job.name}) completed`);
});

campaignCallsWorker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} (${job?.name}) failed:`, err.message);
});

campaignCallsWorker.on("error", (err) => {
  console.error("[worker] Worker error:", err);
});

// Schedule daily trial expiry check at 9am UTC
callQueue
  .add(
    "checkTrialExpiry",
    {},
    {
      repeat: { pattern: "0 9 * * *" },
      jobId: "trial-expiry-check",
    }
  )
  .catch((err) => {
    console.error("[worker] Failed to schedule trial expiry check:", err);
  });
