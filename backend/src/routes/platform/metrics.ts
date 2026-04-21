import express, { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { authenticatePlatform } from "../../middleware/platformAuth.js";

const router = express.Router();

router.use(authenticatePlatform);

router.get("/", async (_req: Request, res: Response) => {
  const [totalOrgs, activeOrgs, trialingOrgs, pastDueOrgs, suspendedOrgs, subs] =
    await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { status: "ACTIVE" } }),
      prisma.organization.count({ where: { status: "TRIAL" } }),
      prisma.organization.count({ where: { status: "PAST_DUE" } }),
      prisma.organization.count({ where: { status: "SUSPENDED" } }),
      prisma.subscription.findMany({
        where: { status: { in: ["ACTIVE", "TRIALING"] } },
        include: { plan: true },
      }),
    ]);

  const mrrCents = subs
    .filter((s) => s.status === "ACTIVE")
    .reduce((sum, s) => sum + s.plan.priceCents, 0);

  const trialsExpiringSoon = await prisma.subscription.count({
    where: {
      status: "TRIALING",
      trialEndsAt: {
        lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    },
  });

  res.json({
    totalOrgs,
    activeOrgs,
    trialingOrgs,
    pastDueOrgs,
    suspendedOrgs,
    mrrCents,
    trialsExpiringSoon,
  });
});

export default router;
