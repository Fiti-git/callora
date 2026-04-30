import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import {
  authenticatePlatform,
  PlatformAuthRequest,
} from "../../middleware/platformAuth.js";
import { writeAudit } from "../../lib/audit.js";
import { encryptString } from "../../lib/crypto.js";

const router = express.Router();

router.use(authenticatePlatform);

router.get("/", async (_req: Request, res: Response) => {
  const orgs = await prisma.organization.findMany({
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { users: true, campaigns: true, leads: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(orgs);
});

router.get("/:id", async (req: Request, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    include: {
      subscription: { include: { plan: true } },
      users: {
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      },
      usage: { orderBy: { periodStart: "desc" }, take: 12 },
      _count: { select: { campaigns: true, leads: true, contacts: true } },
    },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  res.json(org);
});

const statusSchema = z.object({
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"]),
  reason: z.string().optional(),
});

router.patch("/:id/status", async (req: Request, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid status" });

  const org = await prisma.organization.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
  });

  const actor = (req as PlatformAuthRequest).platformUser!;
  await writeAudit({
    actorType: "PLATFORM_USER",
    actorId: actor.id,
    organizationId: org.id,
    action: "org.status.change",
    target: org.id,
    metadata: { to: parsed.data.status, reason: parsed.data.reason },
  });

  res.json(org);
});

const planChangeSchema = z.object({
  planId: z.string().min(1),
});

router.patch("/:id/plan", async (req: Request, res: Response) => {
  const parsed = planChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } });
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const sub = await prisma.subscription.upsert({
    where: { organizationId: req.params.id },
    update: { planId: plan.id },
    create: {
      organizationId: req.params.id,
      planId: plan.id,
      status: "ACTIVE",
    },
    include: { plan: true },
  });

  const actor = (req as PlatformAuthRequest).platformUser!;
  await writeAudit({
    actorType: "PLATFORM_USER",
    actorId: actor.id,
    organizationId: req.params.id,
    action: "org.plan.change",
    target: req.params.id,
    metadata: { planTier: plan.tier },
  });

  res.json(sub);
});

// ----- Phase 5 Agent M1 — admin-only BillingMode toggle ------------------
//
// Tenant routes refuse any payload containing `billingMode` (see auth.ts +
// settings.ts). The ONLY way to flip mode is through this PlatformUser
// endpoint, which also accepts the encrypted ApiKey blob to seed BYOK
// credentials in one round-trip. Reason is mandatory (audit trail).
const billingModeSchema = z.object({
  billingMode: z.enum(["PAYG", "SUBSCRIPTION", "BYOK"]),
  reason: z.string().trim().min(1, "reason required"),
  apiKeys: z
    .object({
      vapiPrivateKey: z.string().min(1).optional(),
      vapiPhoneNumberId: z.string().min(1).optional(),
      geminiApiKey: z.string().min(1).optional(),
      googleMapsKey: z.string().min(1).optional(),
    })
    .optional(),
});

router.patch("/:orgId/billing-mode", async (req: Request, res: Response) => {
  const parsed = billingModeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }
  const { billingMode, reason, apiKeys } = parsed.data;

  const orgId = req.params.orgId;
  const existing = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, billingMode: true },
  });
  if (!existing) {
    return res.status(404).json({ error: "Organization not found" });
  }

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: { billingMode },
    select: { id: true, billingMode: true },
  });

  // Encrypt and upsert ApiKey only when caller provided keys. Unset fields
  // are preserved on the existing row. encryptString uses TWOFA_ENCRYPTION_KEY
  // (general-purpose AES-256-GCM helper, not 2FA-specific).
  let keysProvided = false;
  if (apiKeys && Object.keys(apiKeys).length > 0) {
    const enc: Record<string, string> = {};
    if (apiKeys.googleMapsKey) enc.googleMapsKey = encryptString(apiKeys.googleMapsKey);
    if (apiKeys.geminiApiKey) enc.geminiKey = encryptString(apiKeys.geminiApiKey);
    if (apiKeys.vapiPrivateKey) enc.vapiKey = encryptString(apiKeys.vapiPrivateKey);
    if (apiKeys.vapiPhoneNumberId) enc.vapiPhoneId = encryptString(apiKeys.vapiPhoneNumberId);

    if (Object.keys(enc).length > 0) {
      keysProvided = true;
      await prisma.apiKey.upsert({
        where: { organizationId: orgId },
        update: enc,
        create: { organizationId: orgId, ...enc },
      });
    }
  }

  const actor = (req as PlatformAuthRequest).platformUser!;
  await writeAudit({
    actorType: "PLATFORM_USER",
    actorId: actor.id,
    organizationId: orgId,
    targetOrganizationId: orgId,
    action: "BILLING_MODE_CHANGED",
    entity: "Organization",
    entityId: orgId,
    target: `Organization:${orgId}`,
    metadata: {
      from: existing.billingMode,
      to: billingMode,
      reason,
      keysProvided,
    },
  });

  res.json({ organization: updated, keysProvided });
});

router.get("/:id/audit", async (req: Request, res: Response) => {
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(logs);
});

export default router;
