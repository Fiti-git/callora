import express, { Request, Response } from "express";
import { Queue } from "bullmq";
import prisma from "../../lib/prisma.js";
import {
  authenticatePlatform,
  PlatformAuthRequest,
} from "../../middleware/platformAuth.js";
import { writeAudit } from "../../lib/audit.js";
import { redisConnection, callQueue, deadLetterQueue } from "../../lib/queue.js";

const router = express.Router();
router.use(authenticatePlatform);

void prisma; // referenced indirectly; keeps the import for future audit reads

// Known queues we surface in the admin UI. Add new queues here as the system
// grows; the gateway is intentionally thin and doesn't auto-discover queues.
const QUEUES: Record<string, Queue> = {
  "campaign-calls": callQueue,
  "campaign-calls-dlq": deadLetterQueue,
};

function getQueue(name: string): Queue | null {
  if (QUEUES[name]) return QUEUES[name];
  // Fallback: instantiate by name (cheap â€” BullMQ Queue is just a thin Redis
  // wrapper). Lets ops inspect a queue we forgot to register here.
  try {
    return new Queue(name, { connection: redisConnection });
  } catch {
    return null;
  }
}

/**
 * GET /api/platform/dlq
 *
 * Lists failed BullMQ jobs across registered queues. Caps response at 200
 * jobs total to keep payload sane â€” admins can filter by queue later if
 * needed. Each job is normalised to a stable shape regardless of source.
 */
router.get("/", async (_req: Request, res: Response) => {
  const out: any[] = [];
  for (const [name, q] of Object.entries(QUEUES)) {
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
        if (out.length >= 200) break;
      }
    } catch (err) {
      console.error(`[dlq] failed to read ${name}:`, err);
    }
    if (out.length >= 200) break;
  }
  res.json({ items: out, total: out.length, capped: out.length >= 200 });
});

/**
 * POST /api/platform/dlq/:queue/:jobId/retry
 * Re-runs the job. Writes AuditLog entry.
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
    actorType: "PLATFORM_USER",
    actorId: platformUser.id,
    action: "DLQ_RETRY",
    target: `${queue}:${jobId}`,
    metadata: { queue, jobId },
  });

  res.json({ ok: true });
});

/**
 * POST /api/platform/dlq/:queue/:jobId/discard
 * Permanently removes the job. Writes AuditLog entry.
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
    actorType: "PLATFORM_USER",
    actorId: platformUser.id,
    action: "DLQ_DISCARD",
    target: `${queue}:${jobId}`,
    metadata: { queue, jobId },
  });

  res.json({ ok: true });
});

export default router;
