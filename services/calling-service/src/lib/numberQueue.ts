import { Queue } from "bullmq";
import { redisConnection } from "./queue.js";

/**
 * BullMQ queue for number-provisioning lifecycle jobs.
 * Job names:
 *   - "provision"   { orgId }
 *   - "release"     { orgId }
 *   - "rotate-pool"  (no payload — worker iterates due rows)
 *   - "rotate-one"  { poolRowId }
 */
export const numbersQueue = new Queue("numbers", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: false,
    attempts: 5,
    backoff: { type: "exponential", delay: 60_000 },
  },
});

export type NumbersJobName = "provision" | "release" | "rotate-pool" | "rotate-one";
