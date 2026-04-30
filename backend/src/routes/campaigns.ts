import express, { Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import { parse as parseCsv } from "fast-csv";
import { Readable } from "stream";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { GeminiService } from "../services/gemini.js";
import { PlacesService } from "../services/places.js";
import { VapiService } from "../services/vapi.js";
import {
  assertWithinQuota,
  recordUsage,
  QuotaError,
  QuotaExceededError,
} from "../lib/quota.js";
import { callQueue, redisConnection } from "../lib/queue.js";
import { validateBody } from "../lib/validate.js";
import { writeAuditLog } from "../lib/audit.js";
import { orgRateLimit } from "../middleware/orgRateLimit.js";
import jwt from "jsonwebtoken";
import { Redis } from "ioredis";
import { requireEnv } from "../lib/env.js";
import {
  resolveCredentials,
  CredentialsUnavailableError,
} from "../lib/credentials.js";
import {
  debitWithMarkup,
  InsufficientCreditsError,
} from "../lib/paygDebit.js";

const router = express.Router();
const prismaClient = prisma;

// Module-scope auth helper for the SSE route. EventSource (browser) cannot
// set the Authorization header, so /progress/stream additionally accepts
// `?token=<jwt>` and decodes it the same way the standard middleware does.
const SSE_JWT_SECRET = requireEnv("NEXTAUTH_SECRET");
const REDIS_URL_FOR_SSE = process.env.REDIS_URL ?? "redis://localhost:6379";

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  prompt: z.string().max(5000).optional().nullable(),
  type: z.enum(["AI", "CSV"]).optional(),
});

const followupSettingsSchema = z.object({
  maxRetryAttempts: z.number().int().min(0).max(10).optional(),
  retryDelayHours: z.number().int().min(1).max(168).optional(),
  followUpDelayDays: z.number().int().min(1).max(90).optional(),
});

const importLeadsSchema = z.object({
  leads: z
    .array(
      z.object({
        phone: z.string().max(40).optional(),
        number: z.string().max(40).optional(),
        name: z.string().max(200).optional(),
        company: z.string().max(200).optional(),
        designation: z.string().max(200).optional(),
        discussionArea: z.string().max(500).optional(),
      })
    )
    .min(1)
    .max(10_000),
});

const scrapeSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
});

// --- Follow-up automation helpers ---

function normalizePhone(raw: string): string {
  if (!raw) return "";
  let digits = raw.toString().replace(/[^\d+]/g, "");
  if (digits.startsWith("+1")) digits = digits.slice(2);
  else if (digits.startsWith("1") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function computeNextLeadState(
  callStatus: string,
  isQualified: boolean,
  attemptNumber: number,
  campaign: { maxRetryAttempts: number; retryDelayHours: number; followUpDelayDays: number }
): { status: string; nextCallAt: Date | null; followUpAt: Date | null } {
  const now = new Date();

  if (callStatus === "COMPLETED") {
    if (isQualified) {
      return {
        status: "PENDING_FOLLOWUP",
        nextCallAt: null,
        followUpAt: addDays(now, campaign.followUpDelayDays),
      };
    }
    return { status: "CALLED", nextCallAt: null, followUpAt: null };
  }

  if (
    (callStatus === "NO_ANSWER" || callStatus === "VOICEMAIL") &&
    attemptNumber < campaign.maxRetryAttempts
  ) {
    return {
      status: "PENDING_RETRY",
      nextCallAt: addHours(now, campaign.retryDelayHours),
      followUpAt: null,
    };
  }

  return { status: "CALLED", nextCallAt: null, followUpAt: null };
}

// =====================================================================
// SSE: GET /campaigns/:id/progress/stream
// =====================================================================
//
// Real-time campaign progress over Server-Sent Events. Mounted BEFORE the
// `authenticate` middleware because EventSource cannot set headers — auth
// arrives via `?token=` query param. The legacy JSON `/progress` route below
// is left untouched as a polling fallback.
//
// Events:
//   - snapshot   (on connect, derived from DB)
//   - lead-dispatched  (campaignWorker after each Vapi call placed)
//   - call-completed   (callCompletedWorker after each call wraps)
//   - ping       (every 25s heartbeat — keeps proxies/connections alive)
//
// Both monolith + microservice workers publish to the same Redis channel
// `campaign:<id>:progress`, so a browser connected to either origin sees
// every event.
router.get("/:id/progress/stream", async (req: Request, res: Response) => {
  // 1. Auth — accept Bearer header OR ?token= query param.
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.split(" ")[1]
    : null;
  const queryToken =
    typeof req.query.token === "string" && req.query.token.length > 0
      ? req.query.token
      : null;
  const token = headerToken ?? queryToken;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, SSE_JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
  const organizationId = decoded?.organizationId as string | undefined;
  if (!organizationId) {
    return res.status(401).json({ error: "Unauthorized: Bad claims" });
  }

  const campaignId = req.params.id;

  // 2. Verify the campaign exists and belongs to the caller's org. Reject
  // cross-org access with 404 (don't leak existence).
  const campaign = await prismaClient.campaign.findUnique({
    where: { id: campaignId, organizationId },
    select: { id: true, status: true },
  });
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  // 3. SSE headers + initial keepalive.
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  function send(event: string, data: unknown) {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  // 4. Initial snapshot from DB.
  try {
    const [leadsTotal, leadsByStatus, callsByStatus] = await Promise.all([
      prismaClient.lead.count({ where: { campaignId, organizationId } }),
      prismaClient.lead.groupBy({
        by: ["status"],
        where: { campaignId, organizationId },
        _count: { status: true },
      }),
      prismaClient.callLog.groupBy({
        by: ["status"],
        where: { lead: { campaignId, organizationId } },
        _count: { status: true },
      }),
    ]);

    const byStatus = (
      groups: { status: string; _count: { status: number } }[],
      key: string
    ) => groups.find((g) => g.status === key)?._count.status ?? 0;

    send("snapshot", {
      campaignId,
      status: campaign.status,
      leadsTotal,
      leadsProcessed:
        leadsTotal -
        byStatus(leadsByStatus as any, "NEW") -
        byStatus(leadsByStatus as any, "PENDING_RETRY"),
      qualified: byStatus(leadsByStatus as any, "QUALIFIED"),
      disqualified: byStatus(leadsByStatus as any, "DISQUALIFIED"),
      callsCompleted: byStatus(callsByStatus as any, "COMPLETED"),
      callsFailed: byStatus(callsByStatus as any, "FAILED"),
    });
  } catch (err: any) {
    console.error("[sse] snapshot failed:", err?.message ?? err);
  }

  // 5. Subscribe to Redis pub/sub. Each connection needs its OWN ioredis
  // client because subscribed clients can't issue regular commands. We close
  // it on disconnect.
  const sub = new Redis(REDIS_URL_FOR_SSE, { maxRetriesPerRequest: null });
  const channel = `campaign:${campaignId}:progress`;
  await sub.subscribe(channel).catch((err) => {
    console.error("[sse] subscribe failed:", err);
  });
  sub.on("message", (_chan, raw) => {
    try {
      const parsed = JSON.parse(raw);
      const evt = (parsed.event as string) || "progress";
      send(evt, parsed);
    } catch {
      send("progress", { raw });
    }
  });

  // 6. Heartbeat every 25s.
  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    res.write(`event: ping\ndata: {}\n\n`);
  }, 25_000);

  // 7. Cleanup on disconnect.
  const cleanup = () => {
    clearInterval(heartbeat);
    sub.unsubscribe(channel).catch(() => {});
    sub.quit().catch(() => {});
    if (!res.writableEnded) res.end();
  };
  req.on("close", cleanup);
  req.on("aborted", cleanup);
});

router.use(authenticate);

// GET /campaigns
router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    // Cap list responses at 50 by default. Callers wanting fewer rows can
    // pass ?limit=N (1..50). Cursor pagination via ?cursor=<id>.
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 50);
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const campaigns = await prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { leads: true } } },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    res.json(campaigns);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns
router.post("/", validateBody(createCampaignSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { name, prompt, type } = req.body;

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name,
        type: type || "AI",
        prompt: prompt || null,
        organizationId,
        status: "DRAFT",
      },
    });
    await writeAuditLog(req, "CAMPAIGN_CREATE", "Campaign", campaign.id, {
      name,
      type: type || "AI",
    });
    console.log("Created Campaign:", campaign);
    res.status(201).json(campaign);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /campaigns/:id/followup-settings
router.patch("/:id/followup-settings", validateBody(followupSettingsSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { maxRetryAttempts, retryDelayHours, followUpDelayDays } = req.body;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id, organizationId },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: {
        ...(maxRetryAttempts !== undefined && { maxRetryAttempts: Number(maxRetryAttempts) }),
        ...(retryDelayHours !== undefined && { retryDelayHours: Number(retryDelayHours) }),
        ...(followUpDelayDays !== undefined && { followUpDelayDays: Number(followUpDelayDays) }),
      },
      select: {
        id: true,
        name: true,
        maxRetryAttempts: true,
        retryDelayHours: true,
        followUpDelayDays: true,
      },
    });

    await writeAuditLog(req, "CAMPAIGN_UPDATE", "Campaign", req.params.id, {
      maxRetryAttempts,
      retryDelayHours,
      followUpDelayDays,
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /campaigns/:id
router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id, organizationId },
      include: {
        leads: {
          orderBy: { interestScore: "desc" },
          include: { calls: true },
        },
      },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    res.json(campaign);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/import  — manual CSV upload (JSON path; client parses CSV)
// Hardened: explicitly returns 413 with CSV_ROW_LIMIT_EXCEEDED when over 10k rows.
router.post("/:id/import", async (req: Request, res: Response, next) => {
  const leads = (req.body && (req.body as any).leads) as unknown;
  if (Array.isArray(leads) && leads.length > 10_000) {
    return res
      .status(413)
      .json({ error: "CSV_ROW_LIMIT_EXCEEDED", limit: 10_000, received: leads.length });
  }
  next();
}, validateBody(importLeadsSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;
  const { leads } = req.body as {
    leads: {
      phone?: string;
      name?: string;
      // legacy fields for backward compatibility
      number?: string;
      company?: string;
      designation?: string;
      discussionArea?: string;
    }[];
  };

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: "No leads provided" });
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const count = await prisma.$transaction(async (tx) => {
      let inserted = 0;
      for (const row of leads) {
        const rawPhone = row.phone ?? row.number ?? "";
        const phone = normalizePhone(rawPhone);
        if (!phone || phone.length < 7) continue;

        const businessName = (row.name || row.company || "").trim() || "Unknown";

        const existing = await tx.lead.findFirst({
          where: { campaignId, phone },
        });
        if (existing) continue;

        const notes = [
          row.designation ? `Designation: ${row.designation}` : null,
          row.discussionArea ? `Discussion: ${row.discussionArea}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        await tx.lead.create({
          data: {
            businessName,
            phone,
            notes: notes || null,
            campaignId,
            organizationId,
            status: "NEW",
          },
        });
        inserted++;
      }

      await tx.campaign.update({
        where: { id: campaignId },
        data: { status: "READY" },
      });

      return inserted;
    });

    res.json({ success: true, count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/scrape
router.post("/:id/scrape", validateBody(scrapeSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      include: { organization: { include: { apiKeys: true } } },
    });

    if (!campaign || !campaign.organization.apiKeys) {
      return res
        .status(404)
        .json({ error: "Campaign not found or missing keys" });
    }

    // Phase 5 Agent M5 — resolve credentials. PAYG/SUBSCRIPTION orgs use the
    // platform master keys; BYOK uses the tenant's own keys. The legacy 400
    // "Missing Keys" error is preserved for the BYOK path via the resolver
    // (CredentialsUnavailableError carries a brand-clean message).
    let placesKey: string;
    let geminiKey: string;
    try {
      const placesCreds = await resolveCredentials(organizationId, "PLACES");
      const geminiCreds = await resolveCredentials(organizationId, "GEMINI");
      placesKey = placesCreds.apiKey;
      geminiKey = geminiCreds.apiKey;
    } catch (err: any) {
      if (err instanceof CredentialsUnavailableError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "SCRAPING" },
    });

    const gemini = new GeminiService(geminiKey);
    const places = new PlacesService(placesKey);

    const queries = await gemini.generateSearchQueries(
      campaign.prompt ?? "",
      organizationId
    );

    let leadsData: any[] = [];
    for (const q of queries) {
      const results = await places.findLeads(q, organizationId);
      leadsData = [...leadsData, ...results];
      // Phase 5 Agent M5 — flat-rate Places debit per search, post-markup.
      try {
        const cents = Number(requireEnv("PAYG_PLACES_CENTS_PER_SEARCH"));
        await debitWithMarkup(
          organizationId,
          "DEBIT_DISCOVERY",
          Number.isFinite(cents) && cents > 0 ? cents : 5,
          undefined,
          { query: q, resultCount: results.length }
        );
      } catch (debitErr: any) {
        if (debitErr instanceof InsufficientCreditsError) {
          await prisma.organization
            .update({
              where: { id: organizationId },
              data: { status: "PAUSED_NO_CREDIT" },
            })
            .catch(() => {});
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: "PAUSED_QUOTA" },
          });
          return res.status(402).json({
            error: "INSUFFICIENT_CREDITS",
            code: "INSUFFICIENT_CREDITS",
            required: debitErr.required,
            current: debitErr.current,
            message: "Not enough credits to continue lead discovery. Top up to continue.",
          });
        }
        throw debitErr;
      }
    }

    const uniqueLeads = Array.from(
      new Map(leadsData.map((item: any) => [item.id, item])).values()
    );

    // AI POST-FILTERING
    // We send the leads to Gemini to filter based on the user's prompt logic (e.g. "less than 50 reviews")
    const filteredIds = await gemini.filterLeads(
      uniqueLeads,
      campaign.prompt ?? "",
      organizationId
    );

    // Filter the leads data by the matching IDs
    const finalLeads = uniqueLeads.filter((l) => filteredIds.includes(l.id));

    const limit = req.body.limit || 20;
    const leadsToInsert = finalLeads
      .filter((l: any) => l.phone)
      .slice(0, limit);

    // Quota check — ensure org has capacity for the leads we're about to insert
    await assertWithinQuota(organizationId, "lead", leadsToInsert.length);

    let count = 0;
    for (const leadData of leadsToInsert) {
      // Check if lead already exists for this campaign to avoid duplicates on re-scrape
      const existing = await prisma.lead.findFirst({
        where: { campaignId, phone: leadData.phone },
      });

      if (!existing) {
        await prisma.lead.create({
          data: {
            businessName: leadData.name || "Unknown",
            address: leadData.address,
            phone: leadData.phone,
            campaignId: campaign.id,
            organizationId,
            status: "NEW", // Explicitly NEW
          },
        });
        count++;
      }
    }

    if (count > 0) {
      await recordUsage(organizationId, "lead", count);
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "READY" }, // Ready for calling
    });

    res.json({ success: true, count });
  } catch (error: any) {
    if (error instanceof QuotaError) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "DRAFT" },
      }).catch(() => {});
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof QuotaExceededError || error?.name === "QuotaExceededError") {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "DRAFT" },
      }).catch(() => {});
      return res.status(429).json({
        error: "quota_exceeded",
        message: error.message,
        kind: error.kind,
        current: error.current,
        limit: error.limit,
        units: error.units,
      });
    }
    console.error("Scrape Error:", error);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    });
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/call — enqueue background campaign execution
//
// Phase 1 wrap-up (Task 2): pre-check VAPI_CALL quota BEFORE we enqueue.
// The campaign worker also meters per-call (atomic, race-safe), but waiting
// for the worker to discover quota exhaustion means leads get half-dialed
// and the campaign drops into PAUSED_QUOTA mid-run. Catching it here gives
// the user a clean 429 before anything is dispatched. `?force=true` lets
// the user opt into a partial run (the worker will hit the wall mid-flight).
async function enqueueCampaignCalls(req: Request, res: Response) {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;
  const force = req.query.force === "true" || req.query.force === "1";

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      include: { organization: { include: { apiKeys: true } } },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Phase 5 Agent M5 — credential pre-flight. BYOK orgs need ApiKey row
    // populated; PAYG/SUBSCRIPTION orgs need TenantProvisioning READY. The
    // resolver throws a brand-clean message in either failure mode.
    try {
      await resolveCredentials(organizationId, "VAPI");
    } catch (err: any) {
      if (err instanceof CredentialsUnavailableError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    if (campaign.status === "RUNNING" || campaign.status === "CALLING") {
      return res.status(400).json({ error: "Campaign already running" });
    }

    // Build the lead set — explicitly exclude soft-deleted rows and any
    // numbers in the org-wide blacklist. The Prisma soft-delete extension
    // already filters deleted leads on `prisma`, but we spell it out here
    // so the count we use for quota matches what the worker will dispatch.
    const blacklisted = await prisma.blacklist.findMany({
      where: { organizationId },
      select: { phoneNumber: true },
    });
    const blacklistedSet = new Set(blacklisted.map((b) => b.phoneNumber));

    const allLeads = await prisma.lead.findMany({
      where: {
        campaignId,
        organizationId,
        status: { in: ["NEW", "PENDING_RETRY"] },
      },
      select: { id: true, phone: true },
    });
    const leads = allLeads.filter(
      (l) => l.phone && !blacklistedSet.has(l.phone)
    );

    if (leads.length === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "COMPLETED" },
      });
      return res.json({ success: true, message: "No new leads to call", totalLeads: 0 });
    }

    // ----- Phase 5 Agent M5 — PAYG credit pre-flight -----
    // For PAYG orgs, refuse to enqueue if balance can't cover the estimated
    // dispatch cost (matches the per-call $1.50 placeholder reservation).
    // BYOK / SUBSCRIPTION orgs skip this check — they don't use the ledger.
    {
      const orgRow = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { billingMode: true },
      });
      if (orgRow?.billingMode === "PAYG") {
        const estimatedTotal = leads.length * 150;
        const ledger = await prisma.creditLedger.findUnique({
          where: { organizationId },
        });
        const balance = ledger?.balanceCents ?? 0;
        if (balance < estimatedTotal) {
          return res.status(402).json({
            error: "INSUFFICIENT_CREDITS",
            code: "INSUFFICIENT_CREDITS",
            required: estimatedTotal,
            current: balance,
            message:
              "Not enough credits to start this campaign. Top up to continue.",
          });
        }
      }
    }

    // ----- VAPI_CALL pre-check (Task 2 of Phase 1 wrap-up) -----
    // Resolve plan limit + current period usage. If the dispatch would
    // exceed the limit, refuse with 429 unless ?force=true.
    if (!force) {
      const sub = await prisma.subscription.findUnique({
        where: { organizationId },
        include: { plan: true },
      });
      const limit =
        (sub?.plan?.maxCallsPerMonth ?? sub?.plan?.monthlyCallQuota ?? null) as
          | number
          | null;
      if (limit !== null) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const usage = await prisma.usageRecord.findUnique({
          where: {
            organizationId_periodStart: { organizationId, periodStart: start },
          },
        });
        const current = usage?.callsMade ?? 0;
        if (current + leads.length > limit) {
          return res.status(429).json({
            error: "QUOTA_WOULD_BE_EXCEEDED",
            kind: "VAPI_CALL",
            current,
            limit,
            requested: leads.length,
            message:
              "Starting this campaign would exceed your monthly call quota. Re-run with ?force=true to dispatch a partial run, or upgrade your plan.",
          });
        }
      }
    }

    // Clear any stale cancel flag from a previous run
    await redisConnection.srem("cancelled_campaigns", campaignId);

    const job = await callQueue.add("processCampaignCalls", {
      campaignId,
      organizationId,
      leadIds: leads.map((l) => l.id),
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { jobId: job.id ?? null, status: "RUNNING" },
    });

    await writeAuditLog(req, "CAMPAIGN_START", "Campaign", campaignId, {
      jobId: job.id,
      totalLeads: leads.length,
    });

    res.json({ success: true, jobId: job.id, totalLeads: leads.length });
  } catch (error: any) {
    console.error("Call Enqueue Error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Per-org rate limit on campaign start: 5 req/min per organisation. Stops a
// runaway client from re-queuing the same campaign in a hot loop and stops
// noisy tenants from saturating BullMQ at the expense of others.
const campaignStartLimiter = orgRateLimit({
  name: "campaign-start",
  points: 5,
  duration: 60,
});
router.post("/:id/call", campaignStartLimiter, enqueueCampaignCalls);
router.post("/:id/call-leads", campaignStartLimiter, enqueueCampaignCalls);

// GET /campaigns/:id/progress
router.get("/:id/progress", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      select: { id: true, status: true, jobId: true },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    let progress: { completed: number; total: number } = { completed: 0, total: 0 };
    if (campaign.jobId) {
      const job = await callQueue.getJob(campaign.jobId);
      if (job) {
        const p = job.progress;
        if (p && typeof p === "object" && "total" in p) {
          progress = p as { completed: number; total: number };
        }
      }
    }

    res.json({
      status: campaign.status,
      jobId: campaign.jobId,
      progress,
      campaignStatus: campaign.status,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/cancel
router.post("/:id/cancel", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      select: { id: true },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    await redisConnection.sadd("cancelled_campaigns", campaignId);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "CANCELLED" },
    });

    await writeAuditLog(req, "CAMPAIGN_CANCEL", "Campaign", campaignId);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /campaigns/:id/followups/pending — count leads due for retry/follow-up
router.get("/:id/followups/pending", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;
  const now = new Date();

  try {
    const [retryCount, followUpCount] = await Promise.all([
      prisma.lead.count({
        where: { campaignId, organizationId, status: "PENDING_RETRY", nextCallAt: { lte: now } },
      }),
      prisma.lead.count({
        where: { campaignId, organizationId, status: "PENDING_FOLLOWUP", followUpAt: { lte: now } },
      }),
    ]);

    res.json({ retryCount, followUpCount, total: retryCount + followUpCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /campaigns/:id/followups — process due retries and follow-up calls
router.post("/:id/followups", async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;
  const now = new Date();

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      include: { organization: { include: { apiKeys: true } } },
    });

    if (!campaign || !campaign.organization.apiKeys) {
      return res.status(404).json({ error: "Campaign not found or missing keys" });
    }

    const keys = campaign.organization.apiKeys;
    if (!keys.vapiKey || !keys.vapiPhoneId || !keys.geminiKey) {
      return res.status(400).json({ error: "Missing Vapi/Gemini Keys" });
    }

    const retryLeads = await prisma.lead.findMany({
      where: { campaignId, status: "PENDING_RETRY", nextCallAt: { lte: now } },
    });

    const followUpLeads = await prisma.lead.findMany({
      where: { campaignId, status: "PENDING_FOLLOWUP", followUpAt: { lte: now } },
    });

    const allLeads = [...retryLeads, ...followUpLeads];

    if (allLeads.length === 0) {
      return res.json({ success: true, processed: 0, message: "No follow-ups due" });
    }

    const vapi = new VapiService(keys.vapiKey, keys.vapiPhoneId);
    const orgAiConfig = {
      aiCallerName: campaign.organization.aiCallerName,
      aiCallerCompany: campaign.organization.aiCallerCompany,
      aiCallerPhone: campaign.organization.aiCallerPhone,
      aiSystemPrompt: campaign.organization.aiSystemPrompt,
    };

    let processed = 0;

    // Fire-and-forget: kick off the calls and let the Vapi webhook +
    // callCompletedWorker drive transcript/qualification/note creation.
    for (const lead of allLeads) {
      const callResult = await vapi.makeCall(lead.phone!, lead.businessName, orgAiConfig, organizationId);
      if (!callResult.vapiCallId) continue;

      await prisma.callLog.upsert({
        where: { vapiCallId: callResult.vapiCallId },
        create: {
          leadId: lead.id,
          duration: 0,
          status: "PENDING",
          vapiCallId: callResult.vapiCallId,
        },
        update: { leadId: lead.id },
      });

      const attemptNumber = lead.callAttempts + 1;
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: "CALLED",
          callAttempts: attemptNumber,
        },
      });

      processed++;
    }
    void userId;
    void computeNextLeadState;

    res.json({ success: true, processed });
  } catch (error: any) {
    console.error("Follow-up Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /campaigns/:id — soft-delete. The Prisma soft-delete extension
// hides this campaign from subsequent reads; lead progress queries (incl.
// the SSE snapshot at line ~187) automatically exclude its leads too via
// the same extension.
router.delete("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const campaignId = req.params.id;
  try {
    const result = await prisma.campaign.updateMany({
      where: { id: campaignId, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) return res.status(404).json({ error: "Campaign not found" });
    await writeAuditLog(req, "CAMPAIGN_DELETE", "Campaign", campaignId);
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// =====================================================================
// CSV upload — multipart hardened endpoint (Phase 1 Agent 3)
// =====================================================================
//
// Why a second endpoint?
// The legacy /import path takes JSON ({leads:[…]}) parsed client-side. This
// new path accepts the raw .csv file, lets us enforce filename + MIME on
// the server, streams the parse so a malicious 10MB JSON blob with junk
// rows is rejected fast, and inserts in 500-row chunks via createMany.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB hard cap
  fileFilter: (_req, file, cb) => {
    const okMime =
      file.mimetype === "text/csv" ||
      file.mimetype === "text/plain" ||
      file.mimetype === "application/vnd.ms-excel" || // some browsers send this for .csv
      file.mimetype === "application/octet-stream";
    const okName = /\.csv$/i.test(file.originalname || "");
    if (!okMime || !okName) {
      // Mark a sentinel so the route handler can return 400 with a clean error
      (cb as any)(null, false);
      (_req as any)._csvRejectReason = !okName ? "BAD_FILENAME" : "BAD_MIME";
      return;
    }
    cb(null, true);
  },
});

const csvRowSchema = z.object({
  phone: z.string().min(7).max(40).optional(),
  number: z.string().min(7).max(40).optional(),
  name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  designation: z.string().max(200).optional(),
  discussionArea: z.string().max(500).optional(),
});

const MAX_ROWS = 10_000;

router.post(
  "/:id/csv-upload",
  (req, res, next) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(413)
            .json({ error: "FILE_TOO_LARGE", limit: 10 * 1024 * 1024 });
        }
        return res.status(400).json({ error: err.message || "Upload failed" });
      }
      if ((req as any)._csvRejectReason) {
        return res
          .status(400)
          .json({ error: (req as any)._csvRejectReason });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Missing file" });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const campaignId = req.params.id;
    const file = (req as any).file as Express.Multer.File;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    // Stream-parse, reject as soon as row limit is exceeded.
    const valid: { businessName: string; phone: string; notes: string | null }[] = [];
    const errors: { row: number; message: string }[] = [];
    let rowIndex = 0;
    let aborted = false;
    let abortReason: { status: number; body: any } | null = null;

    await new Promise<void>((resolve) => {
      const stream = Readable.from(file.buffer);
      const parser = parseCsv({ headers: true, ignoreEmpty: true, trim: true });

      parser.on("error", (err: any) => {
        if (aborted) return;
        aborted = true;
        abortReason = { status: 400, body: { error: "CSV_PARSE_ERROR", message: err.message } };
        resolve();
      });

      parser.on("data", (row: Record<string, string>) => {
        rowIndex++;
        if (rowIndex > MAX_ROWS) {
          if (!aborted) {
            aborted = true;
            abortReason = {
              status: 413,
              body: { error: "CSV_ROW_LIMIT_EXCEEDED", limit: MAX_ROWS },
            };
            parser.end();
          }
          return;
        }
        const parsed = csvRowSchema.safeParse(row);
        if (!parsed.success) {
          if (errors.length < 100) {
            errors.push({ row: rowIndex, message: parsed.error.message });
          }
          return;
        }
        const rawPhone = parsed.data.phone ?? parsed.data.number ?? "";
        const phone = normalizePhone(rawPhone);
        if (!phone || phone.length < 7) {
          if (errors.length < 100) {
            errors.push({ row: rowIndex, message: "Invalid phone" });
          }
          return;
        }
        const businessName =
          (parsed.data.name || parsed.data.company || "").trim() || "Unknown";
        const notes = [
          parsed.data.designation ? `Designation: ${parsed.data.designation}` : null,
          parsed.data.discussionArea ? `Discussion: ${parsed.data.discussionArea}` : null,
        ]
          .filter(Boolean)
          .join(" | ");
        valid.push({ businessName, phone, notes: notes || null });
      });

      parser.on("end", () => resolve());
      stream.pipe(parser);
    });

    if (abortReason) {
      const r = abortReason as { status: number; body: any };
      return res.status(r.status).json(r.body);
    }

    // Bulk insert in chunks of 500. Skip duplicates per (campaignId, phone).
    let inserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < valid.length; i += chunkSize) {
      const chunk = valid.slice(i, i + chunkSize);
      try {
        const result = await prisma.lead.createMany({
          data: chunk.map((c) => ({
            businessName: c.businessName,
            phone: c.phone,
            notes: c.notes,
            campaignId,
            organizationId,
            status: "NEW",
          })),
          skipDuplicates: true,
        });
        inserted += result.count;
      } catch (err: any) {
        return res.status(500).json({ error: "BULK_INSERT_FAILED", message: err.message });
      }
    }

    const skippedDuplicates = valid.length - inserted;
    res.json({
      success: true,
      inserted,
      skipped: skippedDuplicates,
      // Phase 2 Agent 7 — explicit alias used by the CRM dedup tests / docs.
      skippedDuplicates,
      errors,
      totalRows: rowIndex,
    });
  }
);

export default router;
