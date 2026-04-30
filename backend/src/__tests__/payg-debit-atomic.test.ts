import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 5 Agent M5 — concurrent debit safety.
 *
 * Two concurrent debits at the edge of the org's balance: exactly one must
 * succeed, the other must throw InsufficientCreditsError. Skipped when no
 * Postgres is reachable.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= process.env.DATABASE_URL ?? "postgresql://localhost:5432/none";
process.env.PAYG_MARKUP_PCT ||= "30";

const prisma = new PrismaClient();
let dbUp = false;

beforeAll(async () => {
  try {
    // Schema-aware probe: rejecting if billingMode + creditLedger aren't on
    // the live DB so we don't run against a stale schema.
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Organization' AND column_name = 'billingMode'`
    )) as Array<{ column_name: string }>;
    dbUp = Array.isArray(rows) && rows.length > 0;
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("payg-debit concurrency", () => {
  it("two concurrent debits at edge of balance → exactly one wins", async () => {
    if (!dbUp) {
      console.warn("skipping: no DB reachable");
      return;
    }
    // Set up an org + ledger with just enough balance for ONE 130-cent debit.
    const org = await prisma.organization.create({
      data: {
        name: "M5 atomic test",
        billingMode: "PAYG",
      },
    });
    await prisma.creditLedger.create({
      data: {
        organizationId: org.id,
        balanceCents: 130, // exactly one debit at 100 raw + 30% markup
        lifetimeAddedCents: 130,
      },
    });
    const { debitWithMarkup, InsufficientCreditsError } = await import("../lib/paygDebit.js");
    const results = await Promise.allSettled([
      debitWithMarkup(org.id, "DEBIT_CALL", 100, "concur-1"),
      debitWithMarkup(org.id, "DEBIT_CALL", 100, "concur-2"),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      InsufficientCreditsError
    );
    // Cleanup
    await prisma.creditTransaction.deleteMany({ where: { organizationId: org.id } });
    await prisma.creditLedger.delete({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
