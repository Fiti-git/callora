import { Job } from "bullmq";
import { prisma } from "@callora/shared";
import { reportUsage, type MeterName } from "../services/stripe.js";
import { redisConnection } from "../lib/queue.js";

/**
 * Hourly usage reporter.
 *
 * Aggregates the last hour of UsageRecord deltas per org and pushes them
 * to Stripe as metered usage. Idempotency is handled two ways:
 *   1. Stripe idempotencyKey = `usage:{org}:{meter}:{hourBucket}` — repeated
 *      runs within the same hour collapse to one Stripe usage record.
 *   2. Redis key `billing:usage:lastReported:{org}:{meter}` stores the high-
 *      watermark UsageRecord.updatedAt we've already sent, so we only ship
 *      genuine deltas.
 *
 * We deliberately avoid adding a `reportedAt` column to UsageRecord — the
 * Redis high-watermark + Stripe idempotency together are sufficient and
 * require no schema migration.
 */

type Snapshot = {
  callsMade: number;
  vapiSpendCents: number;
  leadsScraped: number;
};

const LAST_KEY = (orgId: string, meter: MeterName) =>
  `billing:usage:lastReported:${orgId}:${meter}`;
const SNAP_KEY = (orgId: string, meter: MeterName) =>
  `billing:usage:lastSnapshot:${orgId}:${meter}`;

function hourBucketUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )}T${pad(d.getUTCHours())}`;
}

/**
 * Compute the current monthly UsageRecord totals per org. UsageRecord is
 * keyed by (organizationId, periodStart) — periodStart is the first day of
 * the current calendar month for any in-flight metering. We sum across rows
 * to be safe in case a service writes to a different periodStart granularity.
 */
async function loadCurrentTotals(): Promise<Map<string, Snapshot>> {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const records = await prisma.usageRecord.findMany({
    where: { periodStart: { gte: since } },
    select: {
      organizationId: true,
      callsMade: true,
      vapiSpendCents: true,
      leadsScraped: true,
    },
  });

  const totals = new Map<string, Snapshot>();
  for (const r of records) {
    const cur = totals.get(r.organizationId) ?? {
      callsMade: 0,
      vapiSpendCents: 0,
      leadsScraped: 0,
    };
    cur.callsMade += r.callsMade;
    cur.vapiSpendCents += r.vapiSpendCents;
    cur.leadsScraped += r.leadsScraped;
    totals.set(r.organizationId, cur);
  }
  return totals;
}

async function reportDelta(
  orgId: string,
  meter: MeterName,
  currentTotal: number,
  hourBucket: string
) {
  const lastReported = Number(
    (await redisConnection.get(SNAP_KEY(orgId, meter))) ?? "0"
  );
  const delta = currentTotal - lastReported;
  if (delta <= 0) return { skipped: true as const, delta };

  const result = await reportUsage(orgId, meter, delta, hourBucket);
  if (!result.ok) {
    return { skipped: false as const, ok: false, reason: result.reason, delta };
  }

  // Persist new high-watermark only after a successful Stripe call.
  await redisConnection.set(SNAP_KEY(orgId, meter), String(currentTotal));
  await redisConnection.set(LAST_KEY(orgId, meter), new Date().toISOString());
  return { skipped: false as const, ok: true, delta };
}

export async function usageReporterWorker(_job: Job) {
  const bucket = hourBucketUtc(new Date());
  const totals = await loadCurrentTotals();

  // Number rental is reported as a flat 1-per-org per hour for any org with
  // a provisioned Vapi number. We compute that from Organization.
  const numbers = await prisma.organization.findMany({
    where: { vapiPhoneNumberId: { not: null } },
    select: { id: true },
  });
  const orgsWithNumbers = new Set<string>(numbers.map((o: { id: string }) => o.id));

  let reported = 0;
  let skipped = 0;
  let failed = 0;

  for (const [orgId, snap] of totals) {
    // call_minutes — derive from vapiSpendCents (proxy: 1 cent ~= reportable
    // delta) — TODO: replace with explicit call-duration tracking when the
    // CallLog rollup is added. For now we report cents-of-spend so finance
    // can reconcile, and we'll swap to minutes once the metric exists.
    const callMinutesAgg = Math.floor(snap.vapiSpendCents);

    for (const [meter, value] of [
      ["call_minutes", callMinutesAgg],
      ["leads_qualified", snap.leadsScraped],
    ] as Array<[MeterName, number]>) {
      const r = await reportDelta(orgId, meter, value, bucket);
      if (r.skipped) skipped++;
      else if (r.ok) reported++;
      else failed++;
    }
  }

  // number_rental: flat +1 per hour for orgs holding a number (idempotency
  // key includes the hour bucket so duplicates are absorbed).
  for (const orgId of orgsWithNumbers) {
    const r = await reportUsage(orgId, "number_rental", 1, bucket);
    if (!r.ok) failed++;
    else reported++;
  }

  console.log(
    `[usageReporter] bucket=${bucket} reported=${reported} skipped=${skipped} failed=${failed} orgs=${totals.size} numbers=${orgsWithNumbers.size}`
  );
  return { bucket, reported, skipped, failed };
}
