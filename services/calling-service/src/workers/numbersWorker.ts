import { Worker, Job } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { numbersQueue } from "../lib/numberQueue.js";
import {
  provisionDedicated,
  releaseForOrg,
  rotatePoolNumber,
  findPoolNumbersDueForRotation,
  getProvisioningMode,
} from "../services/numberProvisioner.js";

const QUEUE = "numbers";

export function startNumbersWorker(): Worker {
  const worker = new Worker(
    QUEUE,
    async (job: Job) => {
      switch (job.name) {
        case "provision": {
          const { orgId, areaCode } = job.data as {
            orgId: string;
            areaCode?: string;
          };
          if (!orgId) throw new Error("provision: missing orgId");
          return await provisionDedicated(orgId, areaCode);
        }
        case "release": {
          const { orgId } = job.data as { orgId: string };
          if (!orgId) throw new Error("release: missing orgId");
          return await releaseForOrg(orgId);
        }
        case "rotate-one": {
          const { poolRowId } = job.data as { poolRowId: string };
          if (!poolRowId) throw new Error("rotate-one: missing poolRowId");
          await rotatePoolNumber(poolRowId);
          return { rotated: poolRowId };
        }
        case "rotate-pool": {
          // Cron-fired; fan out one rotate-one job per due row so each rotation
          // can fail/retry independently.
          const due = await findPoolNumbersDueForRotation();
          for (const id of due) {
            await numbersQueue.add(
              "rotate-one",
              { poolRowId: id },
              { jobId: `rotate-one:${id}:${Date.now()}` }
            );
          }
          return { fannedOut: due.length };
        }
        default:
          throw new Error(`numbersWorker: unknown job ${job.name}`);
      }
    },
    { connection: redisConnection, concurrency: 2 }
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[numbersWorker] job ${job?.id} (${job?.name}) failed:`,
      err?.message
    );
  });

  return worker;
}

/**
 * Schedule the weekly pool rotation cron. Idempotent — BullMQ
 * deduplicates by repeat key.
 */
export async function scheduleWeeklyPoolRotation(): Promise<void> {
  // Pool rotation only matters in pool mode. In vapi-managed/byo modes the
  // rotation cron is a no-op and we skip scheduling it entirely.
  if (getProvisioningMode() !== "pool") return;
  await numbersQueue.add(
    "rotate-pool",
    {},
    {
      repeat: { pattern: "0 6 * * 0" }, // Sundays 06:00 UTC
      jobId: "rotate-pool:weekly",
    }
  );
}
