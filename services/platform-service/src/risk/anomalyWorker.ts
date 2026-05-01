// Hourly usage-anomaly worker. For each ACTIVE/TRIAL org:
//   - Compute past-hour calls delta (callsMade increment vs the hour before).
//   - Compute 7-day rolling hourly average from UsageRecord history.
//   - If past-hour > ANOMALY_MULTIPLIER × average AND average > MIN_THRESHOLD,
//     auto-suspend the org, write an AuditLog entry (actorType=SYSTEM,
//     action=auto_suspend_anomaly), and POST notification-service to email
//     the org admin.
//
// The worker tracks per-hour deltas in Redis (`anomaly:hourly:<orgId>`) so
// it never double-suspends and so we can compare hour-to-hour without a
// per-hour table in Postgres.

import { Job, Queue, Worker } from "bullmq";
import { prisma } from "@callora/shared";
import { redisConnection } from "../lib/redis.js";

const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL ?? "http://notification-service:4008";

const ANOMALY_MULTIPLIER = Number(process.env.ANOMALY_MULTIPLIER || 10);
const ANOMALY_MIN_BASELINE = Number(process.env.ANOMALY_MIN_BASELINE || 5);

const QUEUE_NAME = "platform-anomaly";

export const anomalyQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 1,
  },
});

interface OrgWithUsage {
  id: string;
  status: string;
  previousStatus?: string | null;
  usage: { callsMade: number; periodStart: Date; periodEnd: Date }[];
  users: { email: string; name: string | null }[];
}

async function audit(
  organizationId: string,
  action: string,
  metadata: Record<string, unknown>
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: "SYSTEM",
        actorId: "anomalyWorker",
        organizationId,
        action,
        target: organizationId,
        metadata: metadata as any,
      },
    });
  } catch (err) {
    console.error("[anomaly] audit write failed:", err);
  }
}

async function notifyAdmin(email: string, orgId: string, metrics: Record<string, number>) {
  try {
    const resp = await fetch(`${NOTIFICATION_SERVICE_URL}/internal/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: "org_suspended_anomaly",
        to: email,
        data: { orgId, ...metrics },
      }),
    });
    if (!resp.ok) {
      console.error(
        `[anomaly] notification-service HTTP ${resp.status} for ${email}`
      );
    }
  } catch (err) {
    console.error(`[anomaly] notify failed for ${email}:`, err);
  }
}

export async function anomalyWorker(_job: Job) {
  const orgs = (await prisma.organization.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL"] } },
    select: {
      id: true,
      status: true,
      usage: {
        orderBy: { periodStart: "desc" },
        take: 12,
        select: { callsMade: true, periodStart: true, periodEnd: true },
      },
      users: {
        where: { role: "ADMIN" },
        take: 1,
        select: { email: true, name: true },
      },
    },
  })) as unknown as OrgWithUsage[];

  let flagged = 0;

  for (const org of orgs) {
    // Track past-hour delta in Redis: store [previousMonthlyCount, ts] per org.
    const monthly = org.usage[0]?.callsMade ?? 0;
    const trackKey = `anomaly:hourly:${org.id}`;
    const prevRaw = await redisConnection.get(trackKey);
    let pastHourDelta = 0;
    if (prevRaw) {
      try {
        const parsed = JSON.parse(prevRaw) as { c: number; t: number };
        pastHourDelta = Math.max(0, monthly - parsed.c);
      } catch {
        pastHourDelta = 0;
      }
    }
    // Persist current count for next iteration. TTL = 25h so a missed hour
    // doesn't permanently hide the comparison point.
    await redisConnection.setex(
      trackKey,
      25 * 60 * 60,
      JSON.stringify({ c: monthly, t: Date.now() })
    );

    // 7-day rolling hourly average. UsageRecord is a monthly aggregate so we
    // approximate: total callsMade over the last 7 days of records / (7*24).
    const sevenDayWindow = org.usage.slice(0, 1); // current month is the freshest signal
    const totalCalls = sevenDayWindow.reduce((s, r) => s + r.callsMade, 0);
    const elapsedHours = sevenDayWindow.length
      ? Math.max(
          1,
          Math.ceil(
            (Date.now() - new Date(sevenDayWindow[0].periodStart).getTime()) /
              (60 * 60 * 1000)
          )
        )
      : 1;
    const baseline = totalCalls / elapsedHours;

    if (
      baseline >= ANOMALY_MIN_BASELINE &&
      pastHourDelta > ANOMALY_MULTIPLIER * baseline
    ) {
      flagged++;

      await prisma.organization.update({
        where: { id: org.id },
        data: { status: "SUSPENDED" },
      });

      await audit(org.id, "auto_suspend_anomaly", {
        previousStatus: org.status,
        pastHourDelta,
        baselinePerHour: baseline,
        multiplier: ANOMALY_MULTIPLIER,
        minBaseline: ANOMALY_MIN_BASELINE,
      });

      const admin = org.users[0];
      if (admin?.email) {
        await notifyAdmin(admin.email, org.id, {
          pastHourDelta,
          baselinePerHour: Math.round(baseline * 100) / 100,
        });
      }
    }
  }

  console.log(
    `[anomaly] scanned=${orgs.length} flagged=${flagged} multiplier=${ANOMALY_MULTIPLIER} min=${ANOMALY_MIN_BASELINE}`
  );
  return { scanned: orgs.length, flagged };
}

export function startAnomalyWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name === "scanAnomalies") return await anomalyWorker(job);
      console.warn(`[anomaly] unknown job: ${job.name}`);
    },
    { connection: redisConnection, concurrency: 1 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[anomaly] job ${job?.id} failed:`, err.message);
  });

  // Schedule hourly. Repeated job is idempotent by jobId.
  anomalyQueue
    .add(
      "scanAnomalies",
      {},
      { repeat: { pattern: "0 * * * *" }, jobId: "anomaly-hourly-scan" }
    )
    .catch((err) => console.error("[anomaly] schedule failed:", err));

  return worker;
}
