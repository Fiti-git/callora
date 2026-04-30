import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  assertSeatAvailable,
  assertSeatAvailableForLimit,
  SeatLimitExceededError,
} from "../lib/quota.js";

/**
 * Seat-limit enforcement: an org on a plan with seatLimit=N should reject
 * the (N+1)-th user.create. Requires Postgres; skips if not reachable.
 */

const prisma = new PrismaClient();

async function canConnect(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

let dbUp = false;
let orgId = "";
let planId = "";

beforeAll(async () => {
  dbUp = await canConnect();
  if (!dbUp) return;

  const tag = `seat-${Date.now()}`;
  const existing = await prisma.plan.findUnique({ where: { tier: "ENTERPRISE" } });
  if (existing) {
    planId = existing.id;
    await prisma.plan.update({ where: { id: planId }, data: { seatLimit: 3 } });
  } else {
    const created = await prisma.plan.create({
      data: {
        tier: "ENTERPRISE",
        name: `seat-test-${tag}`,
        stripePriceId: `price_seat_${tag}`,
        monthlyCallQuota: 100,
        monthlyLeadQuota: 100,
        seatLimit: 3,
        priceCents: 0,
      },
    });
    planId = created.id;
  }

  const org = await prisma.organization.create({
    data: { name: `seat-org-${tag}` },
  });
  orgId = org.id;
  await prisma.subscription.create({
    data: { organizationId: orgId, planId, status: "ACTIVE" },
  });

  // Seed exactly seatLimit (3) users.
  const pw = await bcrypt.hash("pw", 10);
  for (let i = 0; i < 3; i++) {
    await prisma.user.create({
      data: {
        email: `seat-${tag}-${i}@test.local`,
        password: pw,
        role: "MEMBER",
        organizationId: orgId,
      },
    });
  }
});

afterAll(async () => {
  if (!dbUp) return;
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.subscription.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("seat limit enforcement", () => {
  it.skipIf(!dbUp)(
    "assertSeatAvailable throws SeatLimitExceededError when at limit",
    async () => {
      await expect(assertSeatAvailable(orgId)).rejects.toThrow(
        SeatLimitExceededError
      );
      try {
        await assertSeatAvailable(orgId);
      } catch (e: any) {
        expect(e.current).toBe(3);
        expect(e.limit).toBe(3);
      }
    }
  );

  it.skipIf(!dbUp)(
    "assertSeatAvailableForLimit short-circuits on null (unlimited)",
    async () => {
      await expect(
        assertSeatAvailableForLimit(orgId, null)
      ).resolves.toBeUndefined();
    }
  );

  it.skipIf(!dbUp)(
    "assertSeatAvailableForLimit allows the next user when below limit",
    async () => {
      await expect(
        assertSeatAvailableForLimit(orgId, 5)
      ).resolves.toBeUndefined();
    }
  );

  it.skipIf(!dbUp)(
    "assertSeatAvailableForLimit blocks the next user when at the limit",
    async () => {
      await expect(
        assertSeatAvailableForLimit(orgId, 3)
      ).rejects.toThrow(SeatLimitExceededError);
    }
  );
});
