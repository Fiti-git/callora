import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    organization: { findUnique: vi.fn() },
    callLog: { count: vi.fn() },
    lead: { findFirst: vi.fn() },
    orgVapiNumber: { findUnique: vi.fn() },
    dNCEntry: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return {
    prisma,
    meterAndCharge: vi.fn().mockResolvedValue(undefined),
    complianceCheck: vi.fn().mockResolvedValue({ allowed: true }),
    isOnDNC: vi.fn().mockResolvedValue({ onDnc: false }),
    pickPoolNumber: vi.fn().mockResolvedValue({
      vapiPhoneNumberId: "ph_pool",
      e164: "+14155551111",
    }),
    createCall: vi.fn().mockResolvedValue({ id: "vapi_call_123" }),
  };
});

vi.mock("@callora/shared", () => ({
  prisma: mocks.prisma,
  meterAndCharge: mocks.meterAndCharge,
  QuotaExceededError: class QuotaExceededError extends Error {
    name = "QuotaExceededError";
  },
  timeVendorCall: async (...args: any[]) => {
    const fn = args[args.length - 1];
    return typeof fn === "function" ? fn() : undefined;
  },
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
  setCircuitBreakerState: () => undefined,
  scrubBrandStrings: (s: string) => s,
}));

vi.mock("../compliance/index.js", () => ({
  complianceCheck: mocks.complianceCheck,
  injectConsentDisclosure: vi.fn(),
  recordingRetentionDays: vi.fn(),
  classifyNumber: vi.fn(),
}));
vi.mock("../compliance/dnc.js", () => ({
  isOnDNC: mocks.isOnDNC,
  DNCBlockedError: class DNCBlockedError extends Error {
    name = "DNCBlockedError";
  },
}));
vi.mock("../compliance/consent.js", () => ({
  ConsentRequiredError: class ConsentRequiredError extends Error {
    name = "ConsentRequiredError";
  },
}));
vi.mock("../services/vapiClient.js", () => ({
  createCall: mocks.createCall,
  getCall: vi.fn(),
  purchaseNumber: vi.fn(),
  releaseNumber: vi.fn(),
}));
vi.mock("../services/numberProvisioner.js", () => ({
  pickPoolNumber: mocks.pickPoolNumber,
}));

import { VapiService, TrialCallCapExceededError } from "../services/vapi.js";

const orgConfig = {
  aiCallerName: "Bot",
  aiCallerCompany: "Acme",
  aiCallerPhone: "+14155550000",
  aiSystemPrompt: "Be helpful.",
};

beforeEach(() => {
  mocks.prisma.organization.findUnique.mockReset();
  mocks.prisma.callLog.count.mockReset();
  mocks.prisma.lead.findFirst.mockReset();
  mocks.prisma.orgVapiNumber.findUnique.mockReset();
  mocks.prisma.lead.findFirst.mockResolvedValue({
    id: "lead_1",
    consentGiven: true,
    doNotCall: false,
  });
  mocks.prisma.orgVapiNumber.findUnique.mockResolvedValue(null);
  mocks.createCall.mockClear();
  process.env.TRIAL_CALL_CAP = "20";
  process.env.DNC_HASH_PEPPER = "test-pepper";
  mocks.prisma.dNCEntry.findFirst.mockResolvedValue(null);
});

describe("trial-org call cap", () => {
  it("blocks when a TRIAL org has reached the cap", async () => {
    mocks.prisma.organization.findUnique.mockResolvedValue({ status: "TRIAL" });
    mocks.prisma.callLog.count.mockResolvedValue(20);

    const svc = new VapiService();
    await expect(
      svc.initiateCall("+14155552222", "Biz", orgConfig, "org_trial")
    ).rejects.toBeInstanceOf(TrialCallCapExceededError);
    expect(mocks.createCall).not.toHaveBeenCalled();
  });

  it("allows when a TRIAL org is below the cap", async () => {
    mocks.prisma.organization.findUnique.mockResolvedValue({ status: "TRIAL" });
    mocks.prisma.callLog.count.mockResolvedValue(5);

    const svc = new VapiService();
    const out = await svc.initiateCall(
      "+14155552222",
      "Biz",
      orgConfig,
      "org_trial2"
    );
    expect(out.vapiCallId).toBe("vapi_call_123");
  });

  it("does not enforce the cap on non-TRIAL orgs", async () => {
    mocks.prisma.organization.findUnique.mockResolvedValue({ status: "ACTIVE" });
    mocks.prisma.callLog.count.mockResolvedValue(9999);

    const svc = new VapiService();
    const out = await svc.initiateCall(
      "+14155552222",
      "Biz",
      orgConfig,
      "org_paid"
    );
    expect(out.vapiCallId).toBe("vapi_call_123");
  });
});
