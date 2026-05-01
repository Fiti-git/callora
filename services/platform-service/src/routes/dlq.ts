import express, { Request, Response } from "express";
import { Queue } from "bullmq";
import {
  authenticatePlatform,
  PlatformAuthRequest,
} from "../middleware/platformAuth.js";
import { writeAudit } from "../lib/audit.js";
import { redisConnection } from "../lib/redis.js";

const router = express.Router();
router.use(authenticatePlatform);

// Known queues we surface in the admin DLQ UI. Add new queues here as the
// system grows. The platform-service does not own these queues — it only
// reads from / acts on them via Redis.
const KNOWN_QUEUE_NAMES = [
  "campaign-calls",
  "campaign-calls-dlq",
  "numbers",
  "trial-expiry",
  "tenant-provisioning",
  "follow-ups",
] as const;

const queueCache = new Map<string, Queue>();

function getQueue(name: string): Queue | null {
  const cached = queueCache.get(name);
  if (cached) return cached;
  try {
    const q = new Queue(name, { connection: redisConnection });
    queueCache.set(name, q);
    return q;
  } catch (err) {
    console.error(`[dlq] failed to instantiate queue ${name}:`, err);
    return null;
  }
}

/**
 * GET /api/platform/dlq
 * Lists failed BullMQ jobs across registered queues, capped at 200 total.
 */
router.get("/", async (_req: Request, res: Response) => {
  const out: any[] = [];
  let capped = false;
  for (const name of KNOWN_QUEUE_NAMES) {
    const q = getQueue(name);
    if (!q) continue;
    try {
      const jobs = await q.getFailed(0, 199);
      for (const j of jobs) {
        out.push({
          queue: name,
          jobId: j.id,
          name: j.name,
          failedReason: j.failedReason,
          attemptsMade: j.attemptsMade,
          timestamp: j.timestamp,
          finishedOn: j.finishedOn,
          data: j.data,
        });
        if (out.length >= 200) {
          capped = true;
          break;
        }
      }
    } catch (err) {
      console.error(`[dlq] failed to read ${name}:`, err);
    }
    if (capped) break;
  }
  res.json({ items: out, total: out.length, capped });
});

/**
 * POST /api/platform/dlq/:queue/:jobId/retry
 * Re-runs a failed job. Writes AuditLog.
 */
router.post("/:queue/:jobId/retry", async (req: Request, res: Response) => {
  const platformUser = (req as PlatformAuthRequest).platformUser!;
  const { queue, jobId } = req.params;

  const q = getQueue(queue);
  if (!q) return res.status(404).json({ error: "Unknown queue" });

  const job = await q.getJob(jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  try {
    await job.retry();
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "retry failed" });
  }

  await writeAudit({
    actorType: "PLATFORM",
    actorId: platformUser.id,
    action: "DLQ_RETRY",
    target: `${queue}:${jobId}`,
    metadata: { queue, jobId },
  });

  res.json({ ok: true });
});

/**
 * POST /api/platform/dlq/:queue/:jobId/discard
 * Permanently removes a failed job. Writes AuditLog.
 */
router.post("/:queue/:jobId/discard", async (req: Request, res: Response) => {
  const platformUser = (req as PlatformAuthRequest).platformUser!;
  const { queue, jobId } = req.params;

  const q = getQueue(queue);
  if (!q) return res.status(404).json({ error: "Unknown queue" });

  const job = await q.getJob(jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  try {
    await job.remove();
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "remove failed" });
  }

  await writeAudit({
    actorType: "PLATFORM",
    actorId: platformUser.id,
    action: "DLQ_DISCARD",
    target: `${queue}:${jobId}`,
    metadata: { queue, jobId },
  });

  res.json({ ok: true });
});

export default router;
