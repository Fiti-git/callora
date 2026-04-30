import prisma from "../prisma/index.js";

// =====================================================================
// Legacy quota helpers (kept for back-compat with the monolith routes
// that already call assertWithinQuota / recordUsage). New code should
// use `meterAndCharge` instead.
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
// New per-kind quota enforcement (Phase 1, Agent 2).
//
// `meterAndCharge` atomically checks the org's plan limit for a single
// resource kind and increments the matching UsageRecord counter inside a
// $transaction so two concurrent requests cannot both pass a limit.
//
// Counter / limit mapping:
//   VAPI_CALL    → UsageRecord.callsMade      Plan.maxCallsPerMonth (falls back to monthlyCallQuota)
//   PLACES       → UsageRecord.placesScraped  Plan.maxPlacesPerMonth
//   GEMINI_TOKEN → UsageRecord.aiTokens       Plan.maxGeminiTokensPerMonth
//   EMAIL        → UsageRecord.emailsSent     Plan.maxEmailsPerMonth
//
// A null limit means "unlimited" — the helper still increments the counter
// so the platform can see usage, but never throws.
// =====================================================================

export type MeterKind =
  | "PLACES"
  | "GEMINI_TOKEN"
  | "VAPI_CALL"
  | "EMAIL"
  | "API_CALL"
  // Phase 5 Agent M5 — per-period Vapi spend in cents (post-markup). No plan
  // limit; this counter exists for reporting only.
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
  resolveLimit: (plan: {
    monthlyCallQuota: number;
    maxCallsPerMonth: number | null;
    maxPlacesPerMonth: number | null;
    maxGeminiTokensPerMonth: number | null;
    maxEmailsPerMonth: number | null;
    maxApiCallsPerMonth?: number | null;
  }) => number | null;
}

const KIND_MAP: Record<MeterKind, KindMapping> = {
  VAPI_CALL: {
    field: "callsMade",
    // Prefer the new column when set, otherwise fall back to the legacy
    // monthlyCallQuota so existing seeded plans keep working.
    resolveLimit: (p) =>
      p.maxCallsPerMonth ?? p.monthlyCallQuota ?? null,
  },
  PLACES: {
    field: "placesScraped",
    resolveLimit: (p) => p.maxPlacesPerMonth,
  },
  GEMINI_TOKEN: {
    field: "aiTokens",
    resolveLimit: (p) => p.maxGeminiTokensPerMonth,
  },
  EMAIL: {
    field: "emailsSent",
    resolveLimit: (p) => p.maxEmailsPerMonth,
  },
  API_CALL: {
    field: "apiCallsThisMonth",
    resolveLimit: (p) => p.maxApiCallsPerMonth ?? null,
  },
  // Phase 5 Agent M5 — uncapped Vapi spend reporting counter.
  VAPI_SPEND_CENTS: {
    field: "vapiSpendCents",
    resolveLimit: () => null,
  },
};

/**
 * Throws SeatLimitExceededError if adding one more user to `organizationId`
 * would exceed the org's plan seat limit. A null/undefined seatLimit on
 * the Plan means unlimited.
 *
 * Safe to call from inside a transaction by passing the tx client as the
 * second arg — falls back to the global prisma client otherwise.
 */
export async function assertSeatAvailable(
  organizationId: string,
  client: typeof prisma | any = prisma
): Promise<void> {
  const sub = await client.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  // If there's no plan yet (e.g. in the same tx that creates it), skip —
  // the route is responsible for passing the plan in directly via the
  // `assertSeatAvailableForPlan` variant below.
  if (!sub) return;
  const limit = sub.plan.seatLimit;
  if (limit == null) return;
  const current = await client.user.count({ where: { organizationId } });
  if (current + 1 > limit) {
    throw new SeatLimitExceededError(current, limit);
  }
}

/**
 * Variant for callers that already have a `seatLimit` in hand (e.g. the
 * registration flow looks up the FREE plan up-front, before the
 * Subscription row exists). Pass the seat limit directly.
 */
export async function assertSeatAvailableForLimit(
  organizationId: string,
  seatLimit: number | null | undefined,
  client: typeof prisma | any = prisma
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
    // No subscription = no plan to meter against. Treat as quota error so the
    // caller surfaces a 4xx rather than silently allowing usage.
    throw new QuotaExceededError(kind, 0, 0, units);
  }

  const mapping = KIND_MAP[kind];
  const limit = mapping.resolveLimit(sub.plan);
  const { start, end } = currentPeriod();

  await prisma.$transaction(async (tx) => {
    // Ensure the period row exists so the SELECT has something to lock.
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
