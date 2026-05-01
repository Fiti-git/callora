import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const redisStore = new Map<string, string>();
  return {
    redisStore,
    redisConnection: {
      get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
      setex: vi.fn(async (k: string, _ttl: number, v: string) => {
        redisStore.set(k, v);
        return "OK";
      }),
    },
    prisma: {
      organization: { findMany: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
    },
    fetch: vi.fn().mockResolvedValue({ ok: true }),
  };
});

(globalThis as any).fetch = mocks.fetch;

vi.mock("../lib/redis.js", () => ({ redisConnection: mocks.redisConnection }));
vi.mock("@callora/shared", () => ({ prisma: mocks.prisma }));
vi.mock("bullmq", () => {
  function Queue(this: any) {
    this.add = vi.fn().mockResolvedValue(undefined);
  }
  function Worker(this: any) {
    this.on = vi.fn();
  }
  return { Queue, Worker };
});

import { anomalyWorker } from "../risk/anomalyWorker.js";

beforeEach(() => {
  mocks.redisStore.clear();
  mocks.redisConnection.get.mockClear();
  mocks.redisConnection.setex.mockClear();
  mocks.prisma.organization.findMany.mockReset();
  mocks.prisma.organization.update.mockReset();
  mocks.prisma.auditLog.create.mockReset();
  mocks.fetch.mockClear();
  mocks.fetch.mockResolvedValue({ ok: true });
  process.env.ANOMALY_MULTIPLIER = "10";
  process.env.ANOMALY_MIN_BASELINE = "5";
});

function makeOrg(overrides: any = {}) {
  return {
    id: "org_1",
    status: "ACTIVE",
    usage: [
      {
        callsMade: 100,
        periodStart: new Date(Date.now() - 10 * 60 * 60 * 1000),
        periodEnd: new Date(),
      },
    ],
    users: [{ email: "admin@example.com", name: "Admin" }],
    ...overrides,
  };
}

describe("anomalyWorker", () => {
  it("auto-suspends when past-hour delta > multiplier × baseline and writes AuditLog", async () => {
    // Use a long-elapsed periodStart so the per-hour baseline is small
    // relative to a big single-hour spike.
    //   elapsedHours = 100, callsMade = 1000 → baseline = 10/h (>= MIN 5)
    //   multiplier × baseline = 100; need delta > 100.
    //   prev=0, current=1000 → delta=1000 ≫ 100 → flag.
    const org = makeOrg({
      usage: [
        {
          callsMade: 1000,
          periodStart: new Date(Date.now() - 100 * 60 * 60 * 1000),
          periodEnd: new Date(),
        },
      ],
    });
    mocks.prisma.organization.findMany.mockResolvedValue([org]);
    mocks.redisStore.set(
      `anomaly:hourly:${org.id}`,
      JSON.stringify({ c: 0, t: Date.now() })
    );

    const out = await anomalyWorker({} as any);
    expect(out).toEqual({ scanned: 1, flagged: 1 });
    expect(mocks.prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org_1" },
      data: { status: "SUSPENDED" },
    });
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: "SYSTEM",
        action: "auto_suspend_anomaly",
        organizationId: "org_1",
      }),
    });
    expect(mocks.fetch).toHaveBeenCalled();
  });

  it("does not flag when baseline below ANOMALY_MIN_BASELINE", async () => {
    const org = makeOrg({
      usage: [
        {
          callsMade: 1,
          periodStart: new Date(Date.now() - 10 * 60 * 60 * 1000),
          periodEnd: new Date(),
        },
      ],
    });
    mocks.prisma.organization.findMany.mockResolvedValue([org]);
    mocks.redisStore.set(
      `anomaly:hourly:${org.id}`,
      JSON.stringify({ c: 0, t: Date.now() })
    );

    const out = await anomalyWorker({} as any);
    expect(out.flagged).toBe(0);
    expect(mocks.prisma.organization.update).not.toHaveBeenCalled();
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("does not flag when delta within multiplier × baseline", async () => {
    const org = makeOrg();
    org.usage[0].callsMade = 105;
    mocks.prisma.organization.findMany.mockResolvedValue([org]);
    mocks.redisStore.set(
      `anomaly:hourly:${org.id}`,
      JSON.stringify({ c: 100, t: Date.now() })
    );
    const out = await anomalyWorker({} as any);
    expect(out.flagged).toBe(0);
  });
});
