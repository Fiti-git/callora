import prisma from "./prisma.js";

export type UsageKind = "call" | "lead" | "aiToken";

function currentPeriod(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

async function getOrCreateUsage(organizationId: string) {
  const { start, end } = currentPeriod();
  return prisma.usageRecord.upsert({
    where: { organizationId_periodStart: { organizationId, periodStart: start } },
    update: {},
    create: {
      organizationId,
      periodStart: start,
      periodEnd: end,
    },
  });
}

export async function assertWithinQuota(
  organizationId: string,
  kind: UsageKind,
  amount = 1
) {
  const sub = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  if (!sub) throw new QuotaError("No subscription", 402);

  const usage = await getOrCreateUsage(organizationId);

  if (kind === "call" && usage.callsMade + amount > sub.plan.monthlyCallQuota) {
    throw new QuotaError("Monthly call quota exceeded", 429);
  }
  if (kind === "lead" && usage.leadsScraped + amount > sub.plan.monthlyLeadQuota) {
    throw new QuotaError("Monthly lead quota exceeded", 429);
  }
}

export async function recordUsage(
  organizationId: string,
  kind: UsageKind,
  amount = 1
) {
  const { start } = currentPeriod();
  const field =
    kind === "call" ? "callsMade" : kind === "lead" ? "leadsScraped" : "aiTokens";
  await getOrCreateUsage(organizationId);
  await prisma.usageRecord.update({
    where: { organizationId_periodStart: { organizationId, periodStart: start } },
    data: { [field]: { increment: amount } },
  });
}

export class QuotaError extends Error {
  status: number;
  constructor(message: string, status = 429) {
    super(message);
    this.status = status;
  }
}
