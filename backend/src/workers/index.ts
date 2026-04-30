import { Worker, Job } from "bullmq";
import {
  callQueue,
  deadLetterQueue,
  dunningQueue,
  emailAutomationQueue,
  emailCampaignQueue,
  provisioningQueue,
  redisConnection,
  tenantWebhookQueue,
} from "../lib/queue.js";
import {
  provisioningWorker,
  finalizeProvisioningFailure,
} from "./provisioningWorker.js";
import type { ProvisioningJobData } from "../services/provisioning/index.js";
import { PROVISIONING_JOB_NAME } from "../services/provisioning/index.js";
import { webhookDeliveryWorker, type WebhookDeliveryJobData } from "./webhookDeliveryWorker.js";
import { emailCampaignDispatch, emailCampaignBatch } from "./emailCampaignWorker.js";
import { emailAutomationTick } from "./emailAutomationWorker.js";
import { campaignWorker, CampaignCallJobData } from "./campaignWorker.js";
import { trialExpiryWorker } from "./trialExpiryWorker.js";
import { callCompletedWorker, CallCompletedJobData } from "./callCompletedWorker.js";
import { dunningWorker } from "./dunningWorker.js";
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
    if (job.name === "callCompleted") {
      return await callCompletedWorker(job as Job<CallCompletedJobData>);
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

// Dunning worker — advances DunningState rows every hour. Lives on its own
// queue (`billing-dunning`) so a slow Stripe invoices.pay() retry can't stall
// customer-facing call jobs.
export const dunningQueueWorker = new Worker<any>(
  "billing-dunning",
  async (job: Job<any>) => {
    if (job.name === "dunningTick") {
      return await dunningWorker(job);
    }
    logger.warn({ jobName: job.name }, "unknown job name on billing-dunning queue");
  },
  { connection: redisConnection, concurrency: 1 }
);

dunningQueueWorker.on("failed", (job, err) => {
  logger.error(
    { jobId: job?.id, jobName: job?.name, err: err.message },
    "dunning worker job failed"
  );
  if (sentryEnabled) Sentry.captureException(err, { tags: { component: "dunning" } });
});

// Hourly tick. jobId is fixed so the cron repeat is idempotent across restarts.
dunningQueue
  .add(
    "dunningTick",
    {},
    {
      repeat: { pattern: "0 * * * *" },
      jobId: "dunning-tick",
    }
  )
  .catch((err) => {
    logger.error({ err }, "failed to schedule dunning tick");
  });

// =====================================================================
// Email marketing workers (Phase 3 Agent 10)
// =====================================================================
export const emailCampaignWorker = new Worker<any>(
  "email-campaign-dispatch",
  async (job: Job<any>) => {
    if (job.name === "dispatch") return emailCampaignDispatch(job);
    if (job.name === "batch") return emailCampaignBatch(job);
    logger.warn({ jobName: job.name }, "unknown job on email-campaign-dispatch");
  },
  {
    connection: redisConnection,
    concurrency: Number(process.env.EMAIL_WORKER_CONCURRENCY || 4),
    limiter: { max: 100, duration: 1000 },
  }
);
emailCampaignWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err: err.message }, "email-campaign worker failed");
  if (sentryEnabled) Sentry.captureException(err, { tags: { component: "email-campaign" } });
});

export const emailAutomationWorker = new Worker<any>(
  "email-automation",
  async (job: Job<any>) => {
    if (job.name === "tick") return emailAutomationTick(job);
    logger.warn({ jobName: job.name }, "unknown job on email-automation");
  },
  { connection: redisConnection, concurrency: Number(process.env.EMAIL_WORKER_CONCURRENCY || 4) }
);
emailAutomationWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err: err.message }, "email-automation worker failed");
  if (sentryEnabled) Sentry.captureException(err, { tags: { component: "email-automation" } });
});

// =====================================================================
// Tenant webhook delivery worker (Phase 3 Agent 12)
// =====================================================================
export const tenantWebhookDeliveryWorker = new Worker<any>(
  "tenant-webhook-deliveries",
  async (job: Job<any>) => {
    if (job.name === "deliver") {
      return webhookDeliveryWorker(job as Job<WebhookDeliveryJobData>);
    }
    logger.warn({ jobName: job.name }, "unknown job on tenant-webhook-deliveries");
  },
  {
    connection: redisConnection,
    concurrency: Number(process.env.WEBHOOK_WORKER_CONCURRENCY || 10),
  }
);
tenantWebhookDeliveryWorker.on("failed", (job, err) => {
  logger.warn(
    { jobId: job?.id, jobName: job?.name, attempts: job?.attemptsMade, err: err.message },
    "tenant-webhook delivery attempt failed (may retry)"
  );
});

// =====================================================================
// Provisioning worker (Phase 5 Agent M4)
// =====================================================================
export const provisioningQueueWorker = new Worker<ProvisioningJobData>(
  "provisioning",
  async (job: Job<ProvisioningJobData>) => {
    if (job.name === PROVISIONING_JOB_NAME) {
      return provisioningWorker(job);
    }
    logger.warn({ jobName: job.name }, "unknown job on provisioning queue");
  },
  {
    connection: redisConnection,
    concurrency: Number(process.env.PROVISIONING_WORKER_CONCURRENCY || 2),
  }
);
provisioningQueueWorker.on("failed", async (job, err) => {
  logger.error(
    {
      jobId: job?.id,
      jobName: job?.name,
      attempts: job?.attemptsMade,
      err: err.message,
    },
    "provisioning worker job failed (may retry)"
  );
  if (sentryEnabled) {
    Sentry.captureException(err, {
      tags: { component: "provisioning", jobId: String(job?.id ?? "") },
    });
  }
  // On final attempt: write the FAILED row so the admin retry route has
  // something to operate on.
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    const orgId = job.data?.organizationId;
    if (orgId) {
      try {
        await finalizeProvisioningFailure(orgId, err);
      } catch (finalizeErr) {
        logger.error({ err: finalizeErr, orgId }, "finalizeProvisioningFailure threw");
      }
    }
  }
});

// Touch the queue exports so tree-shaking doesn't drop them.
void emailCampaignQueue;
void emailAutomationQueue;
void tenantWebhookQueue;
void provisioningQueue;
