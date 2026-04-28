import express, { Request, Response } from "express";
import { prisma } from "@callora/shared";
import { authenticate, AuthRequest } from "../middleware/requireAuth.js";

const router = express.Router();

router.use(authenticate);

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;

  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Call volume over time (daily, last 30 days)
    const callVolume = await prisma.$queryRaw<{ date: Date; count: number }[]>`
      SELECT
        DATE_TRUNC('day', cl."createdAt") AS date,
        COUNT(*)::int AS count
      FROM "CallLog" cl
      JOIN "Lead" l ON l.id = cl."leadId"
      WHERE l."organizationId" = ${organizationId}
        AND cl."createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE_TRUNC('day', cl."createdAt")
      ORDER BY date ASC
    `;

    // 2. Call outcome distribution
    const outcomeGroups = await prisma.callLog.groupBy({
      by: ["status"],
      where: { lead: { organizationId } },
      _count: { status: true },
    });
    const outcomeDistribution = outcomeGroups.map((g: { status: string; _count: { status: number } }) => ({
      status: g.status,
      count: g._count.status,
    }));

    // 3. Lead conversion funnel
    const [totalLeads, calledLeads, qualifiedLeads] = await Promise.all([
      prisma.lead.count({ where: { organizationId } }),
      prisma.lead.count({ where: { organizationId, status: { not: "NEW" } } }),
      prisma.lead.count({ where: { organizationId, status: "QUALIFIED" } }),
    ]);

    // 4. Campaign performance
    const campaignsRaw = await prisma.campaign.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        status: true,
        leads: {
          select: {
            status: true,
            calls: {
              select: { duration: true, status: true, cost: true },
            },
          },
        },
      },
    });

    const campaigns = campaignsRaw.map((c: typeof campaignsRaw[number]) => {
      const allCalls = c.leads.flatMap((l: typeof c.leads[number]) => l.calls);
      const totalCalls = allCalls.length;
      const qualifiedLeadCount = c.leads.filter(
        (l: typeof c.leads[number]) => l.status === "QUALIFIED"
      ).length;
      const totalLeadCount = c.leads.length;
      const conversionRate =
        totalLeadCount > 0
          ? Math.round((qualifiedLeadCount / totalLeadCount) * 100 * 10) / 10
          : 0;
      const avgDuration =
        totalCalls > 0
          ? Math.round(
              allCalls.reduce((sum: number, c: { duration: number; status: string; cost: number | null }) => sum + c.duration, 0) / totalCalls
            )
          : 0;
      const totalCost =
        Math.round(
          allCalls.reduce((sum: number, c: { duration: number; status: string; cost: number | null }) => sum + (c.cost ?? 0), 0) * 10000
        ) / 10000;

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        totalCalls,
        qualifiedLeads: qualifiedLeadCount,
        totalLeads: totalLeadCount,
        conversionRate,
        avgDuration,
        totalCost,
      };
    });

    // 5. Cost aggregates (all-time + this month)
    const [allTimeCostAgg, thisMonthCostAgg] = await Promise.all([
      prisma.callLog.aggregate({
        where: { lead: { organizationId } },
        _sum: { cost: true },
        _avg: { duration: true },
      }),
      prisma.callLog.aggregate({
        where: { lead: { organizationId }, createdAt: { gte: startOfMonth } },
        _sum: { cost: true },
      }),
    ]);

    const totalAllTime =
      Math.round((allTimeCostAgg._sum.cost ?? 0) * 10000) / 10000;
    const totalThisMonth =
      Math.round((thisMonthCostAgg._sum.cost ?? 0) * 10000) / 10000;
    const avgDurationAllTime = Math.round(allTimeCostAgg._avg.duration ?? 0);
    const perQualifiedLead =
      qualifiedLeads > 0
        ? Math.round((totalAllTime / qualifiedLeads) * 10000) / 10000
        : 0;

    // 6. Cost breakdown by type (from JSON column)
    const costBreakdownResult = await prisma.$queryRaw<
      {
        transport: number;
        stt: number;
        llm: number;
        tts: number;
        vapi: number;
      }[]
    >`
      SELECT
        COALESCE(SUM((cl."costBreakdown"->>'transport')::float), 0) AS transport,
        COALESCE(SUM((cl."costBreakdown"->>'stt')::float), 0)       AS stt,
        COALESCE(SUM((cl."costBreakdown"->>'llm')::float), 0)       AS llm,
        COALESCE(SUM((cl."costBreakdown"->>'tts')::float), 0)       AS tts,
        COALESCE(SUM((cl."costBreakdown"->>'vapi')::float), 0)      AS vapi
      FROM "CallLog" cl
      JOIN "Lead" l ON l.id = cl."leadId"
      WHERE l."organizationId" = ${organizationId}
        AND cl."costBreakdown" IS NOT NULL
    `;

    const breakdown = costBreakdownResult[0] ?? {
      transport: 0,
      stt: 0,
      llm: 0,
      tts: 0,
      vapi: 0,
    };

    // 7. Cost trend over time (daily, last 30 days)
    const costTrend = await prisma.$queryRaw<{ date: Date; cost: number }[]>`
      SELECT
        DATE_TRUNC('day', cl."createdAt") AS date,
        COALESCE(SUM(cl.cost), 0)         AS cost
      FROM "CallLog" cl
      JOIN "Lead" l ON l.id = cl."leadId"
      WHERE l."organizationId" = ${organizationId}
        AND cl."createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE_TRUNC('day', cl."createdAt")
      ORDER BY date ASC
    `;

    res.json({
      callVolume: callVolume.map((r: { date: Date; count: bigint }) => ({
        date: r.date.toISOString().split("T")[0],
        count: r.count,
      })),
      outcomeDistribution,
      funnel: {
        total: totalLeads,
        called: calledLeads,
        qualified: qualifiedLeads,
      },
      campaigns,
      costs: {
        totalAllTime,
        totalThisMonth,
        avgDurationAllTime,
        breakdown: {
          transport: Math.round(Number(breakdown.transport) * 10000) / 10000,
          stt: Math.round(Number(breakdown.stt) * 10000) / 10000,
          llm: Math.round(Number(breakdown.llm) * 10000) / 10000,
          tts: Math.round(Number(breakdown.tts) * 10000) / 10000,
          vapi: Math.round(Number(breakdown.vapi) * 10000) / 10000,
        },
        perQualifiedLead,
        trend: costTrend.map((r: { date: Date; cost: string }) => ({
          date: r.date.toISOString().split("T")[0],
          cost: Math.round(Number(r.cost) * 10000) / 10000,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
