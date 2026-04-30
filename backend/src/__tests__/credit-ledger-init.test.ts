import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 5 Agent M1 — CreditLedger default values.
 *
 * Confirms the schema-level defaults that Agent M2 (Stripe wrapper) and
 * Agent M5 (debit logic) will rely on:
 *   balanceCents=0, autoRechargeEnabled=true,
 *   autoRechargeThresholdCents=1000, autoRechargeAmountCents=2500.
 *
 * DB-gated: skips when DATABASE_URL is unreachable.
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
  const tag = `ledger-init-${Date.now()}`;
  const org = await prisma.organization.create({ data: { name: `org-${tag}` } });
  orgId = org.id;
});

afterAll(async () => {
  if (!dbUp) return;
  await prisma.creditTransaction.deleteMany({ where: { organizationId: orgId } });
  await prisma.creditLedger.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("CreditLedger default values", () => {
  it.skipIf(!dbUp)("defaults balance=0, autoRecharge enabled, threshold=1000, amount=2500", async () => {
    const ledger = await prisma.creditLedger.create({
      data: { organizationId: orgId },
    });
    expect(ledger.balanceCents).toBe(0);
    expect(ledger.lifetimeAddedCents).toBe(0);
    expect(ledger.lifetimeSpentCents).toBe(0);
    expect(ledger.autoRechargeEnabled).toBe(true);
    expect(ledger.autoRechargeThresholdCents).toBe(1000);
    expect(ledger.autoRechargeAmountCents).toBe(2500);
    expect(ledger.lastAutoRechargeAt).toBeNull();
    expect(ledger.lowBalanceAlertSentAt).toBeNull();
  });
});
