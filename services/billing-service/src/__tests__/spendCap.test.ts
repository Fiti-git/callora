import { describe, it, expect, vi, beforeEach } from "vitest";

type CapRow = {
  organizationId: string;
  dailyCapCents: number;
  monthlyCapCents: number;
  currentDayCents: number;
  currentMonthCents: number;
  lastDayResetAt: Date;
  lastMonthResetAt: Date;
};

const mocks = vi.hoisted(() => {
  const store = new Map<string, any>();
  function txClient() {
    return {
      spendCap: {
        findUnique: async ({ where }: any) =>
          store.get(where.organizationId) ?? null,
        create: async ({ data }: any) => {
          store.set(data.organizationId, { ...data });
          return { ...data };
        },
        update: async ({ where, data }: any) => {
          const existing = store.get(where.organizationId);
          if (!existing) throw new Error("not found");
          const next = { ...existing, ...data };
          store.set(where.organizationId, next);
          return next;
        },
      },
    };
  }
  // Mimic Postgres SERIALIZABLE: only one tx runs at a time. Real Prisma
  // would serialize via row locks; the test verifies that assertSpendCap
  // wraps its read-modify-write in $transaction, not the underlying lock.
  let chain: Promise<any> = Promise.resolve();
  const prisma = {
    $transaction: vi.fn((fn: any) => {
      const next = chain.then(() => fn(txClient()));
      chain = next.catch(() => undefined);
      return next;
    }),
    spendCap: {
      findUnique: async ({ where }: any) =>
        store.get(where.organizationId) ?? null,
    },
  };
  return { prisma, store };
});

vi.mock("@callora/shared", () => ({ prisma: mocks.prisma }));

import { assertSpendCap, SpendCapExceededError, peekSpendCap } from "../spendCap.js";

beforeEach(() => {
  mocks.store.clear();
  mocks.prisma.$transaction.mockClear();
  process.env.DAILY_SPEND_CAP_DEFAULT_CENTS = "1000";
  process.env.MONTHLY_SPEND_CAP_DEFAULT_CENTS = "10000";
});

describe("assertSpendCap", () => {
  it("allows charges below daily cap and accumulates", async () => {
    const r1 = await assertSpendCap("org_a", 300);
    expect(r1.dayCents).toBe(300);
    const r2 = await assertSpendCap("org_a", 500);
    expect(r2.dayCents).toBe(800);
  });

  it("blocks at daily cap with SpendCapExceededError", async () => {
    await assertSpendCap("org_b", 900);
    await expect(assertSpendCap("org_b", 200)).rejects.toBeInstanceOf(
      SpendCapExceededError
    );
  });

  it("resets day counter when lastDayResetAt is in the past", async () => {
    const yesterday = new Date(Date.UTC(2020, 0, 1));
    mocks.store.set("org_c", {
      organizationId: "org_c",
      dailyCapCents: 1000,
      monthlyCapCents: 10000,
      currentDayCents: 990,
      currentMonthCents: 990,
      lastDayResetAt: yesterday,
      lastMonthResetAt: yesterday,
    } as CapRow);
    const out = await assertSpendCap("org_c", 200);
    expect(out.dayCents).toBe(200);
  });

  it("is race-safe via prisma.$transaction (parallel calls counted exactly once each)", async () => {
    const calls = await Promise.all([
      assertSpendCap("org_d", 100),
      assertSpendCap("org_d", 100),
      assertSpendCap("org_d", 100),
    ]);
    const finalDay = Math.max(...calls.map((c) => c.dayCents));
    expect(finalDay).toBe(300);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it("peekSpendCap reports zero for a fresh org without mutating", async () => {
    const out = await peekSpendCap("org_fresh");
    expect(out.currentDayCents).toBe(0);
    expect(out.dailyCapCents).toBe(1000);
  });
});
