import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 5 Agent M1 — TenantProvisioning default state.
 *
 * Confirms a row created with no explicit status defaults to PENDING. Agent
 * M2 (Stripe wrapper) and Agent M3 (Vapi platform wrapper) drive the state
 * machine forward (PENDING → PROVISIONING → READY/FAILED).
 *
 * DB-gated.
 */

const prisma = new PrismaClient();
let dbUp = false;
let orgId = "";

async function canConnect(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  dbUp = await canConnect();
  if (!dbUp) return;
  const tag = `prov-${Date.now()}`;
  const org = await prisma.organization.create({ data: { name: `org-${tag}` } });
  orgId = org.id;
});

afterAll(async () => {
  if (!dbUp) return;
  await prisma.tenantProvisioning.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("TenantProvisioning default", () => {
  it.skipIf(!dbUp)("status defaults to PENDING with empty steps json", async () => {
    const row = await prisma.tenantProvisioning.create({
      data: { organizationId: orgId },
    });
    expect(row.status).toBe("PENDING");
    expect(row.vapiAssistantId).toBeNull();
    expect(row.stripeCustomerId).toBeNull();
    expect(row.failureReason).toBeNull();
    expect(row.provisionedAt).toBeNull();
    expect(row.steps).toEqual({});
  });
});
