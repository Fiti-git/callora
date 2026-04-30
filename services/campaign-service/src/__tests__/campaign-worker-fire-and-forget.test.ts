import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Verifies the fire-and-forget refactor of the campaign-service campaignWorker:
 *   - For N leads, calls calling-service /internal/call exactly N times.
 *   - Upserts a CallLog row keyed on vapiCallId for each one.
 *   - Marks the lead as CALLED with bumped callAttempts.
 *   - Does NOT poll calling-service for completion.
 *   - Completes a 5-lead campaign in well under 100ms with a mocked HTTP layer
 *     (proves no setTimeout-based polling loop is on the hot path).
 */

process.env.VAPI_PRIVATE_KEY = "test-vapi-key";
process.env.VAPI_PHONE_NUMBER_ID = "test-phone-id";
process.env.CALLING_SERVICE_URL = "http://calling-service:4004";
process.env.NOTIFICATION_SERVICE_URL = "http://notification-service:4008";
process.env.LEAD_SERVICE_URL = "http://lead-service:4003";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.DATABASE_URL = "postgresql://localhost:5432/none";

interface FakeCampaign {
  id: string;
  organizationId: string;
  name: string;
  status: string;
  organization: {
    id: string;
    aiCallerName: string | null;
    aiCallerCompany: string | null;
    aiCallerPhone: string | null;
    aiSystemPrompt: string | null;
  };
}

interface FakeLead {
  id: string;
  organizationId: string;
  businessName: string;
  phone: string | null;
  status: string;
  callAttempts: number;
}

const state = {
  campaign: null as FakeCampaign | null,
  leads: new Map<string, FakeLead>(),
  callLogs: [] as Array<{ leadId: string; vapiCallId: string; status: string }>,
  campaignUpdates: [] as string[],
  recordedUsage: 0,
};

// Mock @callora/shared so we don't pull Prisma / Redis / quota into the test.
vi.mock("@callora/shared", () => {
  return {
    prisma: {
      campaign: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (state.campaign && state.campaign.id === where.id) return state.campaign;
          return null;
        }),
        update: vi.fn(async ({ data }: any) => {
          if (state.campaign) {
            state.campaign.status = data.status;
            state.campaignUpdates.push(data.status);
          }
          return state.campaign;
        }),
      },
      lead: {
        findUnique: vi.fn(async ({ where }: any) => state.leads.get(where.id) ?? null),
        update: vi.fn(async ({ where, data }: any) => {
          const lead = state.leads.get(where.id);
          if (!lead) return null;
          if (data.status) lead.status = data.status;
          if (data.callAttempts?.increment) {
            lead.callAttempts += data.callAttempts.increment;
          }
          return lead;
        }),
      },
      callLog: {
        upsert: vi.fn(async ({ where, create }: any) => {
          state.callLogs.push({
            leadId: create.leadId,
            vapiCallId: where.vapiCallId,
            status: create.status,
          });
          return { id: `cl-${state.callLogs.length}`, ...create };
        }),
      },
    },
    assertWithinQuota: vi.fn(async () => {}),
    recordUsage: vi.fn(async () => {
      state.recordedUsage += 1;
    }),
  };
});

// Mock the queue module so we don't open a real Redis connection.
vi.mock("../lib/queue.js", () => {
  return {
    redisConnection: {
      sismember: vi.fn(async () => 0), // never cancelled
      srem: vi.fn(async () => 1),
    },
    callQueue: { add: vi.fn(async () => ({ id: "fake-job" })) },
  };
});

// Spy on global fetch — the worker hits calling-service through it.
const fetchMock = vi.fn();
(globalThis as any).fetch = fetchMock;

// Spy on setTimeout to assert the worker is not polling.
const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

beforeEach(() => {
  state.campaign = {
    id: "camp-1",
    organizationId: "org-1",
    name: "Test campaign",
    status: "DRAFT",
    organization: {
      id: "org-1",
      aiCallerName: "Alex",
      aiCallerCompany: "Callora",
      aiCallerPhone: "+15555550100",
      aiSystemPrompt: null,
    },
  };
  state.leads.clear();
  state.callLogs = [];
  state.campaignUpdates = [];
  state.recordedUsage = 0;
  fetchMock.mockReset();
  setTimeoutSpy.mockClear();

  // Default: every /internal/call returns a unique vapiCallId immediately.
  let n = 0;
  fetchMock.mockImplementation(async (_url: string, _opts: any) => {
    n += 1;
    return new Response(
      JSON.stringify({ callLogId: `cl-${n}`, vapiCallId: `vapi-${n}` }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
});

function makeJob(leadIds: string[]) {
  for (const id of leadIds) {
    state.leads.set(id, {
      id,
      organizationId: "org-1",
      businessName: `Biz ${id}`,
      phone: `+1555000${id.padStart(4, "0")}`,
      status: "NEW",
      callAttempts: 0,
    });
  }
  return {
    data: {
      campaignId: "camp-1",
      organizationId: "org-1",
      leadIds,
    },
    updateProgress: vi.fn(async () => {}),
  } as any;
}

describe("campaign-service campaignWorker (fire-and-forget)", () => {
  it("fires N /internal/call requests for N leads without polling", async () => {
    const { campaignWorker } = await import("../workers/campaignWorker.js");
    const job = makeJob(["1", "2", "3", "4", "5"]);

    const start = Date.now();
    const result = await campaignWorker(job);
    const elapsed = Date.now() - start;

    expect(result).toEqual({ status: "COMPLETED", processed: 5 });

    // Exactly 5 calls to calling-service /internal/call, no /call-result polling.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain("/internal/call");
      expect(String(call[0])).not.toContain("/call-result");
    }

    // 5 PENDING CallLog rows upserted, keyed on the returned vapiCallIds.
    expect(state.callLogs).toHaveLength(5);
    for (const log of state.callLogs) {
      expect(log.status).toBe("PENDING");
      expect(log.vapiCallId).toMatch(/^vapi-\d+$/);
    }

    // Every lead is now CALLED with callAttempts incremented.
    for (const lead of state.leads.values()) {
      expect(lead.status).toBe("CALLED");
      expect(lead.callAttempts).toBe(1);
    }

    // Campaign status flipped RUNNING -> COMPLETED, no PAUSED_QUOTA.
    expect(state.campaignUpdates).toContain("RUNNING");
    expect(state.campaignUpdates).toContain("COMPLETED");
    expect(state.campaignUpdates).not.toContain("PAUSED_QUOTA");

    // Hot path must not call setTimeout (no polling / sleep loop).
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    // 5 leads on a fully-mocked HTTP layer should complete in well under 100ms.
    expect(elapsed).toBeLessThan(100);

    // Usage recorded exactly N times.
    expect(state.recordedUsage).toBe(5);
  });

  it("pauses the campaign when quota is exhausted mid-run", async () => {
    const shared = await import("@callora/shared");
    let n = 0;
    (shared.assertWithinQuota as any).mockImplementation(async () => {
      n += 1;
      if (n > 2) throw new Error("quota exhausted");
    });

    const { campaignWorker } = await import("../workers/campaignWorker.js");
    const job = makeJob(["1", "2", "3", "4", "5"]);
    const result = await campaignWorker(job);

    expect(result).toEqual({ status: "PAUSED_QUOTA", processed: 2 });
    expect(state.campaignUpdates).toContain("PAUSED_QUOTA");
    expect(state.callLogs).toHaveLength(2);
  });
});
