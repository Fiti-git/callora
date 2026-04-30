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

// Dunning queue — hourly tick advances DunningState rows. Separate from the
// campaign-calls queue so a stuck dunning job can't block customer calls and
// vice-versa. Jobs are scheduled with a fixed jobId so the cron repeat is
// idempotent across worker restarts.
export const dunningQueue = new Queue("billing-dunning", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 30, count: 1000 },
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
  },
});

// Email marketing dispatch queue (Phase 3 Agent 10). One job kind per
// campaign for fan-out; batch jobs do the actual Resend.batch.send. The
// automation queue advances per-contact run state machines.
export const emailCampaignQueue = new Queue("email-campaign-dispatch", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
  },
});

export const emailAutomationQueue = new Queue("email-automation", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
  },
});

// Phase 3 Agent 12 — outbound tenant-webhook delivery queue. Each job
// references a single WebhookDelivery row; the worker performs the HTTP
// POST, updates the row, and lets BullMQ schedule retries via the
// configured backoff. 30s / 5m / 30m matches the spec.
export const tenantWebhookQueue = new Queue("tenant-webhook-deliveries", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: false,
    attempts: 3,
    // Custom per-attempt delays handled in the worker via `delay` on retry —
    // the BullMQ exponential backoff doesn't quite map to [30s, 5m, 30m].
    backoff: { type: "exponential", delay: 30_000 },
  },
});

// Phase 5 Agent M4 — hosted-tier (Model B) provisioning queue. One job per
// org runs the 6-step state machine in `workers/provisioningWorker.ts`. Lives
// on its own queue so a stuck Vapi/Twilio number purchase never competes
// with critical campaign-call dispatch. BullMQ-level retries [10s, 60s, 5m]
// are configured per-job in the orchestrator (`services/provisioning/index.ts`)
// — kept off the queue defaults so an isolated re-enqueue from the platform
// retry route uses the same backoff schedule.
export const provisioningQueue = new Queue("provisioning", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 30, count: 1000 },
    removeOnFail: false, // keep failed provisioning jobs forever for triage
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
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

/**
 * Publish a real-time campaign progress event to Redis pub/sub. The SSE
 * endpoint at GET /api/campaigns/:id/progress subscribes to this channel and
 * fans events out to connected browser EventSources.
 *
 * Channel naming: `campaign:<campaignId>:progress`. The same channel name is
 * used by the microservice campaign-service so a browser connected to the
 * gateway sees events from either origin.
 *
 * Failures are swallowed and logged — pub/sub is best-effort. The DB-derived
 * snapshot pushed on connect is the source of truth.
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
