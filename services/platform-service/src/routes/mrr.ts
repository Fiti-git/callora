import express, { Request, Response } from "express";
import { prisma } from "@callora/shared";
import { authenticatePlatform } from "../middleware/platformAuth.js";

const router = express.Router();
router.use(authenticatePlatform);

/**
 * GET /api/platform/mrr
 *
 * MRR + this-month new/churn counts + per-plan breakdown. Plans are billed
 * monthly so MRR = sum(priceCents) over ACTIVE subs. Churn approximation
 * uses Subscription.updatedAt + status=CANCELED.
 */
router.get("/", async (_req: Request, res: Response) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [activeSubs, newThisMonth, churnedThisMonth, totalActiveAtStart] =
    await Promise.all([
      prisma.subscription.findMany({
        where: { status: "ACTIVE" },
        include: { plan: true },
      }),
      prisma.subscription.count({
        where: {
          status: "ACTIVE",
          createdAt: { gte: monthStart, lt: monthEnd },
        },
      }),
      prisma.subscription.count({
        where: {
          status: "CANCELED",
          updatedAt: { gte: monthStart, lt: monthEnd },
        },
      }),
      prisma.subscription.count({
        where: {
          status: { in: ["ACTIVE", "CANCELED"] },
          createdAt: { lt: monthStart },
        },
      }),
    ]);

  const totalMrrCents = activeSubs.reduce(
    (sum: number, s: (typeof activeSubs)[number]) =>
      sum + (s.plan?.priceCents ?? 0),
    0
  );

  const breakdownMap = new Map<
    string,
    { plan: string; tier: string; count: number; mrrCents: number }
  >();
  for (const s of activeSubs) {
    const key = s.planId;
    const entry = breakdownMap.get(key) ?? {
      plan: s.plan?.name ?? "?",
      tier: s.plan?.tier ?? "?",
      count: 0,
      mrrCents: 0,
    };
    entry.count += 1;
    entry.mrrCents += s.plan?.priceCents ?? 0;
    breakdownMap.set(key, entry);
  }

  const churnRate =
    totalActiveAtStart > 0 ? churnedThisMonth / totalActiveAtStart : 0;

  res.json({
    totalMRR: totalMrrCents / 100,
    totalMrrCents,
    newSubscriptionsThisMonth: newThisMonth,
    churnedThisMonth,
    churnRate: Math.round(churnRate * 10000) / 10000,
    churnApproximate: true,
    breakdownByPlan: Array.from(breakdownMap.values()).map((e) => ({
      plan: e.plan,
      tier: e.tier,
      count: e.count,
      mrr: e.mrrCents / 100,
    })),
  });
});

export default router;
