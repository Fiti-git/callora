import prisma from "./prisma.js";

// =====================================================================
// Backend monolith quota helpers.
//
// Two parallel APIs:
//
//   1. Legacy: assertWithinQuota / recordUsage / QuotaError
//      Original API used by routes/campaigns.ts (lead scrape) and the
//      campaign worker. Left in place so existing callers don't break.
//
//   2. New per-kind: meterAndCharge / QuotaExceededError /
//      SeatLimitExceededError. Atomic check + increment in one
//      $transaction so two concurrent dispatches can't both pass the
//      same plan limit. This is the API new code should use.
//
// The new helpers are duplicated here (and in @callora/shared) because
// the monolith and the microservices use *different* Prisma client
// instances — there's no clean way to share a single helper that closes
// over the right client. Logic stays in lockstep; tests cover both.
// =====================================================================

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
    this.name = "QuotaError";
    this.status = status;
  }
}

// =====================================================================
// New per-kind helpers (Phase 1, Agent 2).
// =====================================================================

export type MeterKind =
  | "PLACES"
  | "GEMINI_TOKEN"
  | "VAPI_CALL"
  | "EMAIL"
  | "API_CALL"
  // Phase 5 Agent M5 — per-period Vapi spend in cents (post-markup). Unlike
  // the other counters this isn't capped by a plan limit — it's reporting-only.
  | "VAPI_SPEND_CENTS";

export class QuotaExceededError extends Error {
  readonly kind: MeterKind;
  readonly current: number;
  readonly limit: number;
  readonly units: number;
  readonly status = 429 as const;

  constructor(kind: MeterKind, current: number, limit: number, units: number) {
    super(
      `Monthly quota exceeded for ${kind}: ${current} + ${units} > ${limit}`
    );
    this.name = "QuotaExceededError";
    this.kind = kind;
    this.current = current;
    this.limit = limit;
    this.units = units;
  }
}

export class SeatLimitExceededError extends Error {
  readonly current: number;
  readonly limit: number;
  readonly status = 402 as const;

  constructor(current: number, limit: number) {
    super(`Seat limit reached: ${current}/${limit}`);
    this.name = "SeatLimitExceededError";
    this.current = current;
    this.limit = limit;
  }
}

interface KindMapping {
  field:
    | "callsMade"
    | "placesScraped"
    | "aiTokens"
    | "emailsSent"
    | "apiCallsThisMonth"
    | "vapiSpendCents";
  resolveLimit: (plan: any) => number | null;
}

const KIND_MAP: Record<MeterKind, KindMapping> = {
  VAPI_CALL: {
    field: "callsMade",
    resolveLimit: (p) =>
      (p.maxCallsPerMonth as number | null | undefined) ??
      (p.monthlyCallQuota as number | null | undefined) ??
      null,
  },
  PLACES: {
    field: "placesScraped",
    resolveLimit: (p) => (p.maxPlacesPerMonth as number | null | undefined) ?? null,
  },
  GEMINI_TOKEN: {
    field: "aiTokens",
    resolveLimit: (p) => (p.maxGeminiTokensPerMonth as number | null | undefined) ?? null,
  },
  EMAIL: {
    field: "emailsSent",
    resolveLimit: (p) => (p.maxEmailsPerMonth as number | null | undefined) ?? null,
  },
  API_CALL: {
    field: "apiCallsThisMonth",
    resolveLimit: (p) => (p.maxApiCallsPerMonth as number | null | undefined) ?? null,
  },
  // Phase 5 Agent M5 — uncapped reporting counter. Plan limit always null; the
  // ledger / debit path is the actual gate, not this counter.
  VAPI_SPEND_CENTS: {
    field: "vapiSpendCents",
    resolveLimit: () => null,
  },
};

export async function assertSeatAvailable(
  organizationId: string,
  client: any = prisma
): Promise<void> {
  const sub = await client.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  if (!sub) return;
  const limit = sub.plan.seatLimit;
  if (limit == null) return;
  const current = await client.user.count({ where: { organizationId } });
  if (current + 1 > limit) {
    throw new SeatLimitExceededError(current, limit);
  }
}

export async function assertSeatAvailableForLimit(
  organizationId: string,
  seatLimit: number | null | undefined,
  client: any = prisma
): Promise<void> {
  if (seatLimit == null) return;
  const current = await client.user.count({ where: { organizationId } });
  if (current + 1 > seatLimit) {
    throw new SeatLimitExceededError(current, seatLimit);
  }
}

export async function meterAndCharge(
  organizationId: string,
  kind: MeterKind,
  units: number
): Promise<void> {
  if (units <= 0) return;

  const sub = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  if (!sub) {
    throw new QuotaExceededError(kind, 0, 0, units);
  }

  const mapping = KIND_MAP[kind];
  const limit = mapping.resolveLimit(sub.plan);
  const { start, end } = currentPeriod();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.usageRecord.upsert({
      where: {
        organizationId_periodStart: { organizationId, periodStart: start },
      },
      update: {},
      create: {
        organizationId,
        periodStart: start,
        periodEnd: end,
      },
    });

    const current = (existing as Record<string, unknown>)[mapping.field] as number;

    if (limit !== null && current + units > limit) {
      throw new QuotaExceededError(kind, current, limit, units);
    }

    await tx.usageRecord.update({
      where: {
        organizationId_periodStart: { organizationId, periodStart: start },
      },
      data: { [mapping.field]: { increment: units } },
    });
  });
}
