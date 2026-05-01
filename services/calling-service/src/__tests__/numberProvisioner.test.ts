import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    orgVapiNumber: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    lead: { findMany: vi.fn() },
  };
  return {
    prisma,
    purchaseNumber: vi.fn(),
    releaseNumber: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@callora/shared", () => ({ prisma: mocks.prisma }));
vi.mock("../services/vapiClient.js", () => ({
  purchaseNumber: mocks.purchaseNumber,
  releaseNumber: mocks.releaseNumber,
}));

import {
  provisionDedicated,
  releaseForOrg,
  pickPoolNumber,
} from "../services/numberProvisioner.js";

beforeEach(() => {
  for (const model of Object.values(mocks.prisma) as any[]) {
    for (const fn of Object.values(model) as any[]) {
      if (typeof fn?.mockReset === "function") fn.mockReset();
    }
  }
  mocks.purchaseNumber.mockReset();
  mocks.releaseNumber.mockClear();
  mocks.prisma.lead.findMany.mockResolvedValue([]);
});

describe("provisionDedicated", () => {
  it("is a no-op when org already has an ACTIVE number", async () => {
    mocks.prisma.orgVapiNumber.findUnique.mockResolvedValue({
      vapiPhoneNumberId: "ph_existing",
      e164: "+14155550000",
      status: "ACTIVE",
    });

    const out = await provisionDedicated("org_1");
    expect(out).toEqual({
      vapiPhoneNumberId: "ph_existing",
      e164: "+14155550000",
      alreadyProvisioned: true,
    });
    expect(mocks.purchaseNumber).not.toHaveBeenCalled();
    expect(mocks.prisma.orgVapiNumber.upsert).not.toHaveBeenCalled();
  });

  it("buys a number and mirrors it to organization when no row exists", async () => {
    mocks.prisma.orgVapiNumber.findUnique.mockResolvedValue(null);
    mocks.prisma.organization.findUnique.mockResolvedValue({ name: "Acme" });
    mocks.purchaseNumber.mockResolvedValue({
      id: "ph_new",
      number: "+14155551234",
    });
    mocks.prisma.orgVapiNumber.upsert.mockResolvedValue({});
    mocks.prisma.organization.update.mockResolvedValue({});

    const out = await provisionDedicated("org_2");
    expect(out.alreadyProvisioned).toBe(false);
    expect(out.vapiPhoneNumberId).toBe("ph_new");
    expect(mocks.prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org_2" },
      data: { vapiPhoneNumberId: "ph_new", vapiPhoneNumber: "+14155551234" },
    });
  });
});

describe("releaseForOrg", () => {
  it("sets RELEASED and clears the legacy mirror columns", async () => {
    mocks.prisma.orgVapiNumber.findUnique.mockResolvedValue({
      vapiPhoneNumberId: "ph_x",
      status: "ACTIVE",
    });
    mocks.prisma.orgVapiNumber.update.mockResolvedValue({});
    mocks.prisma.organization.update.mockResolvedValue({});

    const out = await releaseForOrg("org_3");
    expect(out).toEqual({ released: true });
    expect(mocks.releaseNumber).toHaveBeenCalledWith("ph_x");
    expect(mocks.prisma.orgVapiNumber.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_3" },
        data: expect.objectContaining({ status: "RELEASED" }),
      })
    );
    expect(mocks.prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org_3" },
      data: { vapiPhoneNumberId: null, vapiPhoneNumber: null },
    });
  });

  it("is a no-op when row already RELEASED", async () => {
    mocks.prisma.orgVapiNumber.findUnique.mockResolvedValue({
      vapiPhoneNumberId: "ph_x",
      status: "RELEASED",
    });
    const out = await releaseForOrg("org_4");
    expect(out).toEqual({ released: false });
    expect(mocks.releaseNumber).not.toHaveBeenCalled();
  });
});

describe("pickPoolNumber", () => {
  it("prefers a POOL number whose areaCode matches", async () => {
    mocks.prisma.orgVapiNumber.findFirst.mockImplementationOnce((args: any) => {
      expect(args.where.areaCode).toBe("415");
      return Promise.resolve({
        vapiPhoneNumberId: "ph_415",
        e164: "+14155550111",
      });
    });

    const out = await pickPoolNumber("415");
    expect(out).toEqual({
      vapiPhoneNumberId: "ph_415",
      e164: "+14155550111",
    });
    expect(mocks.prisma.orgVapiNumber.findFirst).toHaveBeenCalledTimes(1);
  });

  it("falls back to any POOL when areaCode has no match", async () => {
    mocks.prisma.orgVapiNumber.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        vapiPhoneNumberId: "ph_any",
        e164: "+12025550000",
      });

    const out = await pickPoolNumber("999");
    expect(out?.vapiPhoneNumberId).toBe("ph_any");
    expect(mocks.prisma.orgVapiNumber.findFirst).toHaveBeenCalledTimes(2);
  });
});
