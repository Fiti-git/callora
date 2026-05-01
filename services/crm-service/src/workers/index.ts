/**
 * crm-service worker entrypoint.
 *
 * Hosts the tenant outbound webhook delivery worker. Each WebhookDelivery
 * row produced by routes that emit tenant events is processed exactly once
 * (one job per row) with HMAC signing and BullMQ retry.
 */
import { Worker, type Job } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import {
  webhookDeliveryWorker,
  type WebhookDeliveryJobData,
} from "./webhookDeliveryWorker.js";

export const tenantWebhookDeliveryWorker = new Worker<WebhookDeliveryJobData>(
  "tenant-webhook-deliveries",
  async (job: Job<WebhookDeliveryJobData>) => webhookDeliveryWorker(job),
  {
    connection: redisConnection,
    concurrency: 8,
  }
);

tenantWebhookDeliveryWorker.on("completed", (job) =>
  console.log(`[tenant-webhook-worker] ${job.id} delivered`)
);
tenantWebhookDeliveryWorker.on("failed", (job, err) =>
  console.error(
    `[tenant-webhook-worker] ${job?.id} failed: ${err.message}`
  )
);
tenantWebhookDeliveryWorker.on("error", (err) =>
  console.error("[tenant-webhook-worker] error:", err)
);
