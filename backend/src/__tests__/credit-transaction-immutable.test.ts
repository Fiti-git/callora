import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 5 Agent M1 — schema acceptance check.
 *
 * The atomic-debit logic (compare-and-swap on balance, reject when
 * insufficient) belongs to Agent M5. This test only confirms the schema
 * accepts both a TOPUP and a DEBIT row, and that Agent M5 has the room
 * to maintain a `balanceAfterCents` snapshot per row. The two transactions
 * we insert are paired with manual ledger updates so we can read back a
 * coherent `balanceCents` after the fact.
 *
 * DB-gated.
 */

const prisma = new PrismaClient();
let dbUp = false;
let orgId = "";
let ledgerId = "";

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
  const tag = `tx-${Date.now()}`;
  const org = await prisma.organization.create({ data: { name: `org-${tag}` } });
  orgId = org.id;
  const ledger = await prisma.creditLedger.create({ data: { organizationId: orgId } });
  ledgerId = ledger.id;
});

afterAll(async () => {
  if (!dbUp) return;
  await prisma.creditTransaction.deleteMany({ where: { organizationId: orgId } });
  await prisma.creditLedger.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("CreditTransaction schema accepts TOPUP + DEBIT pair", () => {
  it.skipIf(!dbUp)("inserts a TOPUP then a DEBIT and the ledger reflects net balance", async () => {
    // TOPUP +5000 cents.
    await prisma.$transaction([
      prisma.creditTransaction.create({
        data: {
          ledgerId,
          organizationId: orgId,
          kind: "TOPUP",
          amountCents: 5000,
          balanceAfterCents: 5000,
          ref: "pi_test_topup",
          metadata: { source: "test" },
        },
      }),
      prisma.creditLedger.update({
        where: { organizationId: orgId },
        data: {
          balanceCents: { increment: 5000 },
          lifetimeAddedCents: { increment: 5000 },
        },
      }),
    ]);

    // DEBIT -125 cents (one call cost).
    await prisma.$transaction([
      prisma.creditTransaction.create({
        data: {
          ledgerId,
          organizationId: orgId,
          kind: "DEBIT_CALL",
          amountCents: -125,
          balanceAfterCents: 4875,
          ref: "calllog_test_1",
        },
      }),
      prisma.creditLedger.update({
        where: { organizationId: orgId },
        data: {
          balanceCents: { decrement: 125 },
          lifetimeSpentCents: { increment: 125 },
        },
      }),
    ]);

    const ledger = await prisma.creditLedger.findUnique({
      where: { organizationId: orgId },
    });
    expect(ledger?.balanceCents).toBe(4875);
    expect(ledger?.lifetimeAddedCents).toBe(5000);
    expect(ledger?.lifetimeSpentCents).toBe(125);

    const txs = await prisma.creditTransaction.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
    });
    expect(txs).toHaveLength(2);
    expect(txs[0].kind).toBe("TOPUP");
    expect(txs[0].amountCents).toBe(5000);
    expect(txs[1].kind).toBe("DEBIT_CALL");
    expect(txs[1].amountCents).toBe(-125);
  });
});
