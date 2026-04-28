import { Worker, Job } from "bullmq";
import { callQueue, deadLetterQueue, redisConnection } from "../lib/queue.js";
import { campaignWorker, CampaignCallJobData } from "./campaignWorker.js";
import { trialExpiryWorker } from "./trialExpiryWorker.js";
import { logger } from "../lib/logger.js";
import { Sentry, sentryEnabled } from "../lib/sentry.js";
import prisma from "../lib/prisma.js";

export const campaignCallsWorker = new Worker<any>(
  "campaign-calls",
  async (job: Job<any>) => {
    if (job.name === "processCampaignCalls") {
      return await campaignWorker(job as Job<CampaignCallJobData>);
    }
    if (job.name === "checkTrialExpiry") {
      return await trialExpiryWorker(job);
    }
    logger.warn({ jobName: job.name }, "unknown job name on campaign-calls queue");
  },
  {
    connection: redisConnection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 1),
  }
);

campaignCallsWorker.on("completed", (job) => {
  logger.info({ jobId: job.id, jobName: job.name }, "worker job completed");
});

campaignCallsWorker.on("failed", async (job, err) => {
  logger.error(
    { jobId: job?.id, jobName: job?.name, attempts: job?.attemptsMade, err: err.message },
    "worker job failed"
  );
  if (sentryEnabled) Sentry.captureException(err, { tags: { jobId: String(job?.id), jobName: job?.name ?? "unknown" } });

  // If exhausted retries, push to DLQ and mark any stuck campaign as FAILED.
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    try {
      await deadLetterQueue.add(
        job.name,
        { originalData: job.data, failedReason: err.message, failedAt: new Date().toISOString() },
        { removeOnComplete: false, removeOnFail: false }
      );
      logger.warn({ jobId: job.id, jobName: job.name }, "job moved to dead-letter queue");
    } catch (dlqErr) {
      logger.error({ err: dlqErr }, "failed to push job to DLQ");
    }

    // Recover stuck campaign so users can retry. Avoid leaving it in RUNNING.
    if (job.name === "processCampaignCalls" && job.data?.campaignId) {
      try {
        await prisma.campaign.update({
          where: { id: job.data.campaignId },
          data: { status: "FAILED" },
        });
      } catch (updateErr) {
        logger.error({ err: updateErr, campaignId: job.data.campaignId }, "failed to mark campaign FAILED");
      }
    }
  }
});

campaignCallsWorker.on("error", (err) => {
  logger.error({ err }, "worker error");
  if (sentryEnabled) Sentry.captureException(err);
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
    logger.error({ err }, "failed to schedule trial expiry check");
  });
