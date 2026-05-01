/**
 * notification-service worker entrypoint.
 *
 * Two BullMQ workers:
 *   - email-campaign-dispatch: dispatch + batch jobs for email marketing
 *     campaigns (Resend.batch.send under the hood).
 *   - email-automation:        tick jobs for drip-style automations.
 *
 * Imported lazily from index.ts AFTER the HTTP server is up so /health
 * responds during Redis connect.
 */
import { Worker, type Job } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import {
  emailCampaignDispatch,
  emailCampaignBatch,
} from "./emailCampaignWorker.js";
import { emailAutomationTick } from "./emailAutomationWorker.js";

export const emailCampaignWorker = new Worker(
  "email-campaign-dispatch",
  async (job: Job) => {
    if (job.name === "dispatch") return emailCampaignDispatch(job as any);
    if (job.name === "batch") return emailCampaignBatch(job as any);
    console.warn(`[email-campaign-worker] unknown job: ${job.name}`);
  },
  {
    connection: redisConnection,
    // Resend rate limit is 100/sec — keep concurrency modest.
    concurrency: 4,
    limiter: { max: 50, duration: 1000 },
  }
);

emailCampaignWorker.on("completed", (job) =>
  console.log(`[email-campaign-worker] ${job.id} (${job.name}) ok`)
);
emailCampaignWorker.on("failed", (job, err) =>
  console.error(
    `[email-campaign-worker] ${job?.id} (${job?.name}) failed: ${err.message}`
  )
);
emailCampaignWorker.on("error", (err) =>
  console.error("[email-campaign-worker] error:", err)
);

export const emailAutomationWorker = new Worker(
  "email-automation",
  async (job: Job) => {
    if (job.name === "tick") return emailAutomationTick(job as any);
    console.warn(`[email-automation-worker] unknown job: ${job.name}`);
  },
  {
    connection: redisConnection,
    concurrency: 4,
  }
);

emailAutomationWorker.on("completed", (job) =>
  console.log(`[email-automation-worker] ${job.id} (${job.name}) ok`)
);
emailAutomationWorker.on("failed", (job, err) =>
  console.error(
    `[email-automation-worker] ${job?.id} (${job?.name}) failed: ${err.message}`
  )
);
emailAutomationWorker.on("error", (err) =>
  console.error("[email-automation-worker] error:", err)
);
