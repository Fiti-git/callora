import express, { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";

const router = express.Router();

// GDPR Article 15 — Right of access. Returns a JSON dump of all org-scoped data.
router.get("/export", authenticate, async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;

  const [
    organization,
    users,
    apiKeys,
    campaigns,
    leads,
    callLogs,
    contacts,
    notes,
    tasks,
    deals,
    blacklist,
    subscription,
    usage,
  ] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.user.findMany({
      where: { organizationId },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
    }),
    prisma.apiKey.findMany({
      where: { organizationId },
      select: { id: true },
    }),
    prisma.campaign.findMany({ where: { organizationId } }),
    prisma.lead.findMany({ where: { organizationId } }),
    prisma.callLog.findMany({ where: { lead: { organizationId } } }),
    prisma.contact.findMany({ where: { organizationId } }),
    prisma.note.findMany({ where: { organizationId } }),
    prisma.task.findMany({ where: { organizationId } }),
    prisma.deal.findMany({ where: { organizationId } }),
    prisma.blacklist.findMany({ where: { organizationId } }),
    prisma.subscription.findUnique({ where: { organizationId } }),
    prisma.usageRecord.findMany({ where: { organizationId } }),
  ]);

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="callora-export-${organizationId}-${new Date().toISOString().slice(0, 10)}.json"`
  );
  res.json({
    exportedAt: new Date().toISOString(),
    organization,
    users,
    apiKeys,
    campaigns,
    leads,
    callLogs,
    contacts,
    notes,
    tasks,
    deals,
    blacklist,
    subscription,
    usage,
  });
});

// GDPR Article 17 — Right to erasure. Hard-deletes all org-scoped data. ADMIN only.
router.delete("/delete", authenticate, requireRole("ADMIN"), async (req: Request, res: Response) => {
  const { organizationId, userId } = (req as AuthRequest).user!;
  const confirm = req.body?.confirm;

  if (confirm !== "DELETE-MY-DATA") {
    return res.status(400).json({
      error: 'Confirmation required. POST { "confirm": "DELETE-MY-DATA" } to proceed.',
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.callLog.deleteMany({ where: { lead: { organizationId } } });
      await tx.note.deleteMany({ where: { organizationId } });
      await tx.task.deleteMany({ where: { organizationId } });
      await tx.deal.deleteMany({ where: { organizationId } });
      await tx.contact.deleteMany({ where: { organizationId } });
      await tx.lead.deleteMany({ where: { organizationId } });
      await tx.campaign.deleteMany({ where: { organizationId } });
      await tx.blacklist.deleteMany({ where: { organizationId } });
      await tx.usageRecord.deleteMany({ where: { organizationId } });
      await tx.passwordResetToken.deleteMany({
        where: { user: { organizationId } },
      });
      await tx.apiKey.deleteMany({ where: { organizationId } });
      await tx.subscription.deleteMany({ where: { organizationId } });
      await tx.user.deleteMany({ where: { organizationId } });
      await tx.organization.delete({ where: { id: organizationId } });
    });

    logger.warn({ organizationId, requestedBy: userId }, "GDPR data deletion completed");
    res.json({ success: true, deletedAt: new Date().toISOString() });
  } catch (err) {
    logger.error({ err, organizationId }, "GDPR deletion failed");
    res.status(500).json({ error: "Failed to delete organization data" });
  }
});

export default router;
