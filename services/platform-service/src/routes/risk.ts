import express, { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@callora/shared";
import {
  authenticatePlatform,
  PlatformAuthRequest,
} from "../middleware/platformAuth.js";
import { writeAudit } from "../lib/audit.js";

const router = express.Router();
router.use(authenticatePlatform);

// GET /api/platform/risk/anomalies
// Lists recent auto-suspend events from AuditLog.
router.get("/anomalies", async (_req: Request, res: Response) => {
  const logs = await prisma.auditLog.findMany({
    where: { action: "auto_suspend_anomaly" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Hydrate with current org status so the admin UI knows whether each
  // anomaly has already been resolved.
  const orgIds = Array.from(
    new Set(
      logs
        .map((l: { organizationId: string | null }) => l.organizationId)
        .filter((x: string | null): x is string => !!x)
    )
  );
  const orgs = orgIds.length
    ? await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true, status: true },
      })
    : [];
  const orgById = new Map(
    orgs.map((o: { id: string; name: string; status: string }) => [o.id, o])
  );

  res.json(
    logs.map((l: any) => ({
      id: l.id,
      organizationId: l.organizationId,
      organization: l.organizationId ? orgById.get(l.organizationId) ?? null : null,
      createdAt: l.createdAt,
      metadata: l.metadata,
    }))
  );
});

// POST /api/platform/risk/unsuspend/:orgId
// Reverts an auto-suspended org back to its previous status (defaults to ACTIVE).
const unsuspendSchema = z
  .object({ status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE"]).optional() })
  .optional();

router.post("/unsuspend/:orgId", async (req: Request, res: Response) => {
  const parsed = unsuspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const orgId = req.params.orgId;
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  if (org.status !== "SUSPENDED") {
    return res.status(409).json({ error: "Organization is not SUSPENDED" });
  }

  // Try to read previousStatus from the most recent auto_suspend_anomaly entry.
  let previous: string | undefined = parsed.data?.status;
  if (!previous) {
    const lastSuspend = await prisma.auditLog.findFirst({
      where: { organizationId: orgId, action: "auto_suspend_anomaly" },
      orderBy: { createdAt: "desc" },
    });
    const meta = (lastSuspend?.metadata as Record<string, unknown> | null) ?? null;
    const fromMeta = meta && typeof meta["previousStatus"] === "string"
      ? (meta["previousStatus"] as string)
      : undefined;
    previous = fromMeta && ["TRIAL", "ACTIVE", "PAST_DUE"].includes(fromMeta)
      ? fromMeta
      : "ACTIVE";
  }

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: { status: previous as any },
  });

  const actor = (req as PlatformAuthRequest).platformUser!;
  await writeAudit({
    actorType: "PLATFORM",
    actorId: actor.id,
    organizationId: orgId,
    action: "manual_unsuspend_anomaly",
    target: orgId,
    metadata: { restoredTo: previous },
  });

  res.json(updated);
});

export default router;
