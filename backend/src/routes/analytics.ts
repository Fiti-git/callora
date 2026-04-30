import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

// =====================================================================
// Range parsing
// =====================================================================
//
// Accepts ?from=<ISO>&to=<ISO>. Defaults to "last 30 days" when absent.
// Caps the window at 366 days to keep the cost of $queryRaw bounded.

const rangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

interface ParsedRange {
  from: Date;
  to: Date;
  /** Inclusive number of days covered by the range, used for cohort comparisons. */
  days: number;
}

function parseRange(req: Request): ParsedRange | { error: string } {
  const parsed = rangeQuerySchema.safeParse(req.query);
  if (!parsed.success) return { error: "Invalid range" };
  const now = new Date();
  const to = parsed.data.to ? new Date(parsed.data.to) : now;
  const from = parsed.data.from
    ? new Date(parsed.data.from)
    : new Date(now.getTime() - 30 * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { error: "Invalid date" };
  }
  if (to < from) return { error: "to must be >= from" };
  const days = Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
  if (days > MAX_RANGE_DAYS) {
    return { error: `Range too large (max ${MAX_RANGE_DAYS} days)` };
  }
  return { from, to, days };
}

// =====================================================================
// Aggregation primitive
// =====================================================================
//
// Reused by GET /, GET /campaigns/:id, GET /cohort. Filters by org and
// optionally a single campaignId, plus a [from, to) window.

async function buildAnalytics(opts: {
  organizationId: string;
  from: Date;
  to: Date;
  campaignId?: string;
}) {
  const { organizationId, from, to, campaignId } = opts;
  const monthStart = new Date(to.getFullYear(), to.getMonth(), 1);

  const leadWhere: any = { organizationId };
  if (campaignId) leadWhere.campaignId = campaignId;

  const callLogLeadWhere: any = { lead: { organizationId } };
  if (campaignId) callLogLeadWhere.lead = { organizationId, campaignId };

  // 1. Call volume over time (daily, in range)
  const callVolume = campaignId
    ? await prisma.$queryRaw<{ date: Date; count: number }[]>`
        SELECT DATE_TRUNC('day', cl."createdAt") AS date, COUNT(*)::int AS count
        FROM "CallLog" cl
        JOIN "Lead" l ON l.id = cl."leadId"
        WHERE l."organizationId" = ${organizationId}
          AND l."campaignId"     = ${campaignId}
          AND cl."createdAt" >= ${from}
          AND cl."createdAt" <  ${to}
        GROUP BY DATE_TRUNC('day', cl."createdAt")
        ORDER BY date ASC`
    : await prisma.$queryRaw<{ date: Date; count: number }[]>`
        SELECT DATE_TRUNC('day', cl."createdAt") AS date, COUNT(*)::int AS count
        FROM "CallLog" cl
        JOIN "Lead" l ON l.id = cl."leadId"
        WHERE l."organizationId" = ${organizationId}
          AND cl."createdAt" >= ${from}
          AND cl."createdAt" <  ${to}
        GROUP BY DATE_TRUNC('day', cl."createdAt")
        ORDER BY date ASC`;

  // 2. Outcome distribution (range-filtered)
  const outcomeGroups = await prisma.callLog.groupBy({
    by: ["status"],
    where: {
      ...callLogLeadWhere,
      createdAt: { gte: from, lt: to },
    },
    _count: { status: true },
  });
  const outcomeDistribution = outcomeGroups.map((g) => ({
    status: g.status,
    count: g._count.status,
  }));

  // 3. Funnel (lifetime, scoped to filter)
  const [totalLeads, calledLeads, qualifiedLeads] = await Promise.all([
    prisma.lead.count({ where: leadWhere }),
    prisma.lead.count({ where: { ...leadWhere, status: { not: "NEW" } } }),
    prisma.lead.count({ where: { ...leadWhere, status: "QUALIFIED" } }),
  ]);

  // 4. Campaign performance (lifetime, single-campaign returns one row)
  const campaignsRaw = await prisma.campaign.findMany({
    where: campaignId
      ? { organizationId, id: campaignId }
      : { organizationId },
    select: {
      id: true,
      name: true,
      status: true,
      leads: {
        select: {
          status: true,
          calls: { select: { duration: true, status: true, cost: true } },
        },
      },
    },
  });

  const campaigns = campaignsRaw.map((c) => {
    const allCalls = c.leads.flatMap((l) => l.calls);
    const totalCalls = allCalls.length;
    const qLeads = c.leads.filter((l) => l.status === "QUALIFIED").length;
    const tLeads = c.leads.length;
    const conversionRate =
      tLeads > 0 ? Math.round((qLeads / tLeads) * 100 * 10) / 10 : 0;
    const avgDuration =
      totalCalls > 0
        ? Math.round(allCalls.reduce((s, x) => s + x.duration, 0) / totalCalls)
        : 0;
    const totalCost =
      Math.round(allCalls.reduce((s, x) => s + (x.cost ?? 0), 0) * 10000) / 10000;
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      totalCalls,
      qualifiedLeads: qLeads,
      totalLeads: tLeads,
      conversionRate,
      avgDuration,
      totalCost,
    };
  });

  // 5. Cost aggregates
  const [allTimeCostAgg, thisMonthCostAgg, rangeCostAgg] = await Promise.all([
    prisma.callLog.aggregate({
      where: callLogLeadWhere,
      _sum: { cost: true },
      _avg: { duration: true },
    }),
    prisma.callLog.aggregate({
      where: { ...callLogLeadWhere, createdAt: { gte: monthStart } },
      _sum: { cost: true },
    }),
    prisma.callLog.aggregate({
      where: { ...callLogLeadWhere, createdAt: { gte: from, lt: to } },
      _sum: { cost: true },
      _avg: { duration: true },
    }),
  ]);

  const totalAllTime = Math.round((allTimeCostAgg._sum.cost ?? 0) * 10000) / 10000;
  const totalThisMonth = Math.round((thisMonthCostAgg._sum.cost ?? 0) * 10000) / 10000;
  const totalInRange = Math.round((rangeCostAgg._sum.cost ?? 0) * 10000) / 10000;
  const avgDurationAllTime = Math.round(allTimeCostAgg._avg.duration ?? 0);
  const perQualifiedLead =
    qualifiedLeads > 0
      ? Math.round((totalAllTime / qualifiedLeads) * 10000) / 10000
      : 0;

  // 6. Cost breakdown
  const costBreakdownResult = campaignId
    ? await prisma.$queryRaw<
        { transport: number; stt: number; llm: number; tts: number; vapi: number }[]
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
          AND l."campaignId"     = ${campaignId}
          AND cl."costBreakdown" IS NOT NULL`
    : await prisma.$queryRaw<
        { transport: number; stt: number; llm: number; tts: number; vapi: number }[]
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
          AND cl."costBreakdown" IS NOT NULL`;

  const breakdown = costBreakdownResult[0] ?? { transport: 0, stt: 0, llm: 0, tts: 0, vapi: 0 };

  // 7. Cost trend (range-filtered)
  const costTrend = campaignId
    ? await prisma.$queryRaw<{ date: Date; cost: number }[]>`
        SELECT DATE_TRUNC('day', cl."createdAt") AS date, COALESCE(SUM(cl.cost), 0) AS cost
        FROM "CallLog" cl
        JOIN "Lead" l ON l.id = cl."leadId"
        WHERE l."organizationId" = ${organizationId}
          AND l."campaignId"     = ${campaignId}
          AND cl."createdAt" >= ${from}
          AND cl."createdAt" <  ${to}
        GROUP BY DATE_TRUNC('day', cl."createdAt")
        ORDER BY date ASC`
    : await prisma.$queryRaw<{ date: Date; cost: number }[]>`
        SELECT DATE_TRUNC('day', cl."createdAt") AS date, COALESCE(SUM(cl.cost), 0) AS cost
        FROM "CallLog" cl
        JOIN "Lead" l ON l.id = cl."leadId"
        WHERE l."organizationId" = ${organizationId}
          AND cl."createdAt" >= ${from}
          AND cl."createdAt" <  ${to}
        GROUP BY DATE_TRUNC('day', cl."createdAt")
        ORDER BY date ASC`;

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    callVolume: callVolume.map((r) => ({
      date: r.date.toISOString().split("T")[0],
      count: r.count,
    })),
    outcomeDistribution,
    funnel: { total: totalLeads, called: calledLeads, qualified: qualifiedLeads },
    campaigns,
    costs: {
      totalAllTime,
      totalThisMonth,
      totalInRange,
      avgDurationAllTime,
      breakdown: {
        transport: Math.round(Number(breakdown.transport) * 10000) / 10000,
        stt: Math.round(Number(breakdown.stt) * 10000) / 10000,
        llm: Math.round(Number(breakdown.llm) * 10000) / 10000,
        tts: Math.round(Number(breakdown.tts) * 10000) / 10000,
        vapi: Math.round(Number(breakdown.vapi) * 10000) / 10000,
      },
      perQualifiedLead,
      trend: costTrend.map((r) => ({
        date: r.date.toISOString().split("T")[0],
        cost: Math.round(Number(r.cost) * 10000) / 10000,
      })),
    },
  };
}

// =====================================================================
// Routes
// =====================================================================

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const range = parseRange(req);
  if ("error" in range) return res.status(400).json({ error: range.error });

  try {
    const data = await buildAnalytics({
      organizationId,
      from: range.from,
      to: range.to,
    });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/campaigns/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const range = parseRange(req);
  if ("error" in range) return res.status(400).json({ error: range.error });

  try {
    // Cross-org guard.
    const c = await prisma.campaign.findUnique({
      where: { id: req.params.id, organizationId },
      select: { id: true },
    });
    if (!c) return res.status(404).json({ error: "Campaign not found" });

    const data = await buildAnalytics({
      organizationId,
      from: range.from,
      to: range.to,
      campaignId: req.params.id,
    });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/cohort", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const period = (req.query.period as string) ?? "month";
  if (period !== "week" && period !== "month") {
    return res.status(400).json({ error: "period must be 'week' or 'month'" });
  }

  // Compute "this period" relative to now, then "last period" of equal length
  // immediately preceding it. This intentionally uses calendar-week / calendar-
  // month style ranges (not custom ranges) so the comparison is intuitive.
  const now = new Date();
  let thisFrom: Date;
  let thisTo: Date;
  let lastFrom: Date;
  let lastTo: Date;
  if (period === "week") {
    // ISO week starting Monday.
    const dow = (now.getDay() + 6) % 7; // 0=Mon..6=Sun
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - dow);
    thisFrom = startOfWeek;
    thisTo = now;
    lastFrom = new Date(startOfWeek.getTime() - 7 * DAY_MS);
    lastTo = startOfWeek;
  } else {
    thisFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    thisTo = now;
    lastFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    lastTo = thisFrom;
  }

  try {
    const [thisPeriod, lastPeriod] = await Promise.all([
      buildAnalytics({ organizationId, from: thisFrom, to: thisTo }),
      buildAnalytics({ organizationId, from: lastFrom, to: lastTo }),
    ]);
    res.json({ period, thisPeriod, lastPeriod });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
