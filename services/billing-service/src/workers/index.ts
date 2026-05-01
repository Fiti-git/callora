import { Worker, Job } from "bullmq";
import { billingQueue, redisConnection } from "../lib/queue.js";
import { usageReporterWorker } from "./usageReporterWorker.js";
import { dunningWorker } from "./dunningWorker.js";

export const billingJobsWorker = new Worker<any>(
  "billing-jobs",
  async (job: Job<any>) => {
    if (job.name === "reportUsage") {
      return await usageReporterWorker(job);
    }
    if (job.name === "dunningTick") {
      return await dunningWorker(job);
    }
    console.warn(`[billing-worker] unknown job: ${job.name}`);
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

billingJobsWorker.on("completed", (job) => {
  console.log(`[billing-worker] job ${job.id} (${job.name}) completed`);
});

billingJobsWorker.on("failed", (job, err) => {
  console.error(`[billing-worker] job ${job?.id} (${job?.name}) failed:`, err.message);
});

billingJobsWorker.on("error", (err) => {
  console.error("[billing-worker] worker error:", err);
});

// Schedule the hourly usage reporter (top of every hour, UTC).
billingQueue
  .add(
    "reportUsage",
    {},
    {
      repeat: { pattern: "0 * * * *" },
      jobId: "billing-usage-reporter",
    }
  )
  .catch((err) => {
    console.error("[billing-worker] failed to schedule usage reporter:", err);
  });

// Schedule the hourly dunning tick (15 minutes past the hour to avoid
// overlapping with the usage reporter).
billingQueue
  .add(
    "dunningTick",
    {},
    {
      repeat: { pattern: "15 * * * *" },
      jobId: "billing-dunning-tick",
    }
  )
  .catch((err) => {
    console.error("[billing-worker] failed to schedule dunning tick:", err);
  });
