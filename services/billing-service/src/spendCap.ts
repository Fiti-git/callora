import { prisma } from "@callora/shared";

/**
 * Thrown when a spend-cap check would be violated. Other services should map
 * this to a 402 / 429 response.
 */
export class SpendCapExceededError extends Error {
  readonly orgId: string;
  readonly scope: "daily" | "monthly";
  readonly capCents: number;
  readonly currentCents: number;
  readonly attemptedCents: number;

  constructor(
    orgId: string,
    scope: "daily" | "monthly",
    capCents: number,
    currentCents: number,
    attemptedCents: number
  ) {
    super(
      `Spend cap exceeded for org ${orgId} (${scope}): cap=${capCents} current=${currentCents} attempted=${attemptedCents}`
    );
    this.name = "SpendCapExceededError";
    this.orgId = orgId;
    this.scope = scope;
    this.capCents = capCents;
    this.currentCents = currentCents;
    this.attemptedCents = attemptedCents;
  }
}

function defaultCaps() {
  const daily = Number(process.env.DAILY_SPEND_CAP_DEFAULT_CENTS) || 10_000; // $100
  const monthly =
    Number(process.env.MONTHLY_SPEND_CAP_DEFAULT_CENTS) || 100_000; // $1000
  return { daily, monthly };
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Atomically check + reserve `costCents` against the org's spend cap.
 * Throws SpendCapExceededError on violation. Race-safe via a Prisma
 * transaction with row-level read inside the same tx.
 */
export async function assertSpendCap(
  orgId: string,
  costCents: number
): Promise<{ ok: true; dayCents: number; monthCents: number }> {
  if (!Number.isFinite(costCents) || costCents < 0) {
    throw new Error(`assertSpendCap: invalid costCents=${costCents}`);
  }

  const now = new Date();
  const dayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);
  const { daily, monthly } = defaultCaps();

  return prisma.$transaction(async (tx: any) => {
    let cap = await tx.spendCap.findUnique({ where: { organizationId: orgId } });
    if (!cap) {
      cap = await tx.spendCap.create({
        data: {
          organizationId: orgId,
          dailyCapCents: daily,
          monthlyCapCents: monthly,
          currentDayCents: 0,
          currentMonthCents: 0,
          lastDayResetAt: dayStart,
          lastMonthResetAt: monthStart,
        },
      });
    }

    let dayCents = cap.currentDayCents;
    let monthCents = cap.currentMonthCents;
    let lastDayResetAt = cap.lastDayResetAt;
    let lastMonthResetAt = cap.lastMonthResetAt;

    if (lastDayResetAt < dayStart) {
      dayCents = 0;
      lastDayResetAt = dayStart;
    }
    if (lastMonthResetAt < monthStart) {
      monthCents = 0;
      lastMonthResetAt = monthStart;
    }

    const projectedDay = dayCents + costCents;
    const projectedMonth = monthCents + costCents;

    if (projectedDay > cap.dailyCapCents) {
      throw new SpendCapExceededError(
        orgId,
        "daily",
        cap.dailyCapCents,
        dayCents,
        costCents
      );
    }
    if (projectedMonth > cap.monthlyCapCents) {
      throw new SpendCapExceededError(
        orgId,
        "monthly",
        cap.monthlyCapCents,
        monthCents,
        costCents
      );
    }

    await tx.spendCap.update({
      where: { organizationId: orgId },
      data: {
        currentDayCents: projectedDay,
        currentMonthCents: projectedMonth,
        lastDayResetAt,
        lastMonthResetAt,
      },
    });

    return { ok: true as const, dayCents: projectedDay, monthCents: projectedMonth };
  });
}

/**
 * Read-only peek at the current cap state (with virtual reset applied).
 * Does NOT mutate counters.
 */
export async function peekSpendCap(orgId: string) {
  const cap = await prisma.spendCap.findUnique({ where: { organizationId: orgId } });
  if (!cap) {
    const { daily, monthly } = defaultCaps();
    return {
      organizationId: orgId,
      dailyCapCents: daily,
      monthlyCapCents: monthly,
      currentDayCents: 0,
      currentMonthCents: 0,
    };
  }
  const now = new Date();
  const dayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);
  return {
    organizationId: orgId,
    dailyCapCents: cap.dailyCapCents,
    monthlyCapCents: cap.monthlyCapCents,
    currentDayCents: cap.lastDayResetAt < dayStart ? 0 : cap.currentDayCents,
    currentMonthCents:
      cap.lastMonthResetAt < monthStart ? 0 : cap.currentMonthCents,
  };
}
