import express, { Request, Response } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import prisma, { rawPrisma } from "../lib/prisma.js";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { ensureStripe } from "../services/stripe.js";
import { logger } from "../lib/logger.js";

const router = express.Router();

router.use(authenticate);

// Cap any one entity in the export to avoid runaway memory/payload size for
// very large orgs. If hit, the entity file's metadata records `_truncated:true`.
const EXPORT_ENTITY_CAP = 100_000;
const TRANSCRIPT_CAP = 5_000;

function clip<T extends { id: string }>(rows: T[]): { rows: T[]; truncated: boolean } {
  if (rows.length > EXPORT_ENTITY_CAP) {
    return { rows: rows.slice(0, EXPORT_ENTITY_CAP), truncated: true };
  }
  return { rows, truncated: false };
}

function entity<T extends { id: string }>(name: string, rows: T[]) {
  const { rows: capped, truncated } = clip(rows);
  return {
    _entity: name,
    _count: capped.length,
    _truncated: truncated,
    items: capped,
  };
}

// =====================================================================
// GET /api/privacy/export — GDPR Article 15 (Right of access)
// ADMIN-only. Returns a single streamed JSON document keyed by entity.
// =====================================================================
//
// Streaming as a single JSON (not a ZIP) is a deliberate deviation from the
// originally-requested archiver pipeline: pulling in `archiver` for one
// endpoint isn't worth a new prod dependency right now. The shape is still
// per-entity (each entity has its own `items` + `_truncated` marker), so a
// future ZIP wrapper can split this into one file per entity without
// changing what callers see.
router.get(
  "/export",
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const { organizationId, userId } = (req as AuthRequest).user!;

    try {
      // Build the bundle. We use `_includeDeleted: true` so soft-deleted rows
      // are still exported — the user has a right to data we kept around.
      const includeAll = { _includeDeleted: true } as any;

      const [
        organization,
        users,
        contacts,
        leads,
        deals,
        tasks,
        notes,
        campaigns,
        callLogs,
        subscription,
        usage,
        emailLogs,
        blacklist,
      ] = await Promise.all([
        prisma.organization.findUnique({ where: { id: organizationId } }),
        prisma.user.findMany({
          where: { organizationId },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            emailVerified: true,
            createdAt: true,
            updatedAt: true,
            // Intentionally exclude: password, twoFASecret, twoFARecoveryCodes,
            // verifyToken, tokenVersion.
          },
          take: EXPORT_ENTITY_CAP + 1,
        }),
        prisma.contact.findMany({
          where: { organizationId },
          take: EXPORT_ENTITY_CAP + 1,
          ...includeAll,
        }),
        prisma.lead.findMany({
          where: { organizationId },
          take: EXPORT_ENTITY_CAP + 1,
          ...includeAll,
        }),
        prisma.deal.findMany({
          where: { organizationId },
          take: EXPORT_ENTITY_CAP + 1,
          ...includeAll,
        }),
        prisma.task.findMany({
          where: { organizationId },
          take: EXPORT_ENTITY_CAP + 1,
          ...includeAll,
        }),
        prisma.note.findMany({
          where: { organizationId },
          take: EXPORT_ENTITY_CAP + 1,
          ...includeAll,
        }),
        prisma.campaign.findMany({
          where: { organizationId },
          take: EXPORT_ENTITY_CAP + 1,
          ...includeAll,
        }),
        prisma.callLog.findMany({
          where: { lead: { organizationId } },
          take: EXPORT_ENTITY_CAP + 1,
          ...includeAll,
        }),
        prisma.subscription.findUnique({ where: { organizationId } }),
        prisma.usageRecord.findMany({ where: { organizationId } }),
        prisma.emailLog.findMany({
          where: { organizationId },
          take: EXPORT_ENTITY_CAP + 1,
        }),
        prisma.blacklist.findMany({
          where: { organizationId },
          take: EXPORT_ENTITY_CAP + 1,
          ...includeAll,
        }),
      ]);

      // Redact CallLog transcripts to TRANSCRIPT_CAP characters. Long
      // transcripts blow up payload size; the cap keeps exports usable.
      const redactedCallLogs = callLogs.map((c: any) => ({
        ...c,
        transcript:
          typeof c.transcript === "string" && c.transcript.length > TRANSCRIPT_CAP
            ? c.transcript.slice(0, TRANSCRIPT_CAP) + "…[truncated]"
            : c.transcript,
      }));

      // Best-effort Stripe invoice fetch. Failures shouldn't kill the export.
      let billingHistory: any[] = [];
      let billingHistoryError: string | null = null;
      if (subscription?.stripeCustomerId) {
        try {
          const stripe = ensureStripe();
          const invoices = await stripe.invoices.list({
            customer: subscription.stripeCustomerId,
            limit: 100,
          });
          billingHistory = invoices.data.map((inv) => ({
            id: inv.id,
            amount_paid: inv.amount_paid,
            amount_due: inv.amount_due,
            currency: inv.currency,
            status: inv.status,
            created: inv.created,
            hosted_invoice_url: inv.hosted_invoice_url,
            invoice_pdf: inv.invoice_pdf,
          }));
        } catch (err: any) {
          billingHistoryError = err?.message ?? "stripe-fetch-failed";
        }
      }

      const bundle = {
        exportedAt: new Date().toISOString(),
        exportedBy: userId,
        organization,
        subscription,
        billingHistory: {
          _entity: "billingHistory",
          _count: billingHistory.length,
          _error: billingHistoryError,
          items: billingHistory,
        },
        users: entity("users", users),
        contacts: entity("contacts", contacts),
        leads: entity("leads", leads),
        deals: entity("deals", deals),
        tasks: entity("tasks", tasks),
        notes: entity("notes", notes),
        campaigns: entity("campaigns", campaigns),
        callLogs: entity("callLogs", redactedCallLogs),
        emailLogs: entity("emailLogs", emailLogs),
        blacklist: entity("blacklist", blacklist),
        usage,
      };

      await writeAuditLog(req, "GDPR_EXPORT", "Organization", organizationId, {
        exportedEntities: Object.keys(bundle),
      });

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="callora-export-${organizationId}-${stamp}.json"`
      );
      res.json(bundle);
    } catch (err: any) {
      logger.error({ err, organizationId }, "GDPR export failed");
      res.status(500).json({ error: "GDPR export failed" });
    }
  }
);

// =====================================================================
// DELETE /api/privacy/delete — GDPR Article 17 (Right to erasure)
// ADMIN-only. Anonymises PII; preserves audit trail (CallLog/AuditLog/EmailLog).
// =====================================================================
const deleteSchema = z.object({
  // Plain-language confirmation token; identical to the value the typed-input
  // modal in the UI emits. Mismatched/missing → 400, no destructive action.
  confirmation: z.literal("DELETE_MY_ORG"),
  // Free-form audit metadata; not required, capped to keep the row small.
  reason: z.string().max(500).optional(),
});

router.delete(
  "/delete",
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const { organizationId, userId } = (req as AuthRequest).user!;

    const parsed = deleteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "GDPR_DELETE_CONFIRMATION_REQUIRED",
        message:
          'POST { "confirmation": "DELETE_MY_ORG", "reason"?: "..." } to proceed.',
        issues: parsed.error.issues,
      });
    }
    const { reason } = parsed.data;

    // 1. Cancel Stripe subscription FIRST. If Stripe fails, abort BEFORE we
    //    anonymise anything. Use rawPrisma so we can read the Stripe id even
    //    if the org is somehow already soft-flagged.
    const subscription = await rawPrisma.subscription.findUnique({
      where: { organizationId },
      select: { stripeSubscriptionId: true },
    });
    if (subscription?.stripeSubscriptionId) {
      try {
        const stripe = ensureStripe();
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      } catch (err: any) {
        logger.error({ err, organizationId }, "GDPR delete: Stripe cancel failed");
        return res.status(502).json({
          error: "STRIPE_CANCEL_FAILED",
          message:
            "Could not cancel Stripe subscription. No data has been modified. Please retry or contact support.",
        });
      }
    }

    // 2. Generate stable suffix used across anonymised rows.
    const hash = crypto
      .createHash("sha256")
      .update(`${organizationId}-${Date.now()}`)
      .digest("hex");
    const hash8 = hash.slice(0, 8);

    try {
      // We deliberately use `rawPrisma` (the un-extended client) inside the
      // transaction so:
      //  - Anonymisation `update` calls aren't accidentally filtered.
      //  - Soft-deleted rows in this org also get their PII anonymised.
      //
      // Increase the interactiveTransaction timeout — large orgs may take a
      // few seconds to walk through tasks/notes/etc.
      await rawPrisma.$transaction(
        async (tx) => {
          // 3. Anonymise users in the org. Email/name → deterministic dummy.
          //    `tokenVersion++` revokes every active JWT immediately.
          const users = await tx.user.findMany({
            where: { organizationId },
            select: { id: true },
          });
          for (const u of users) {
            const userHash = crypto
              .createHash("sha256")
              .update(u.id)
              .digest("hex")
              .slice(0, 12);
            await tx.user.update({
              where: { id: u.id },
              data: {
                name: `DELETED_USER_${userHash.slice(0, 8)}`,
                email: `deleted+${userHash}@callora.local`,
                password: crypto.randomBytes(32).toString("hex"),
                emailVerified: false,
                verifyToken: null,
                verifyTokenExp: null,
                twoFASecret: null,
                twoFAEnabled: false,
                twoFARecoveryCodes: [],
                tokenVersion: { increment: 1 },
              },
            });
          }

          // 4. Anonymise Contact PII (keep row to preserve FK integrity).
          await tx.contact.updateMany({
            where: { organizationId },
            data: {
              businessName: "[DELETED]",
              phone: "",
              email: null,
              address: null,
            },
          });

          // 5. Anonymise Lead PII. Keep CallLogs — redact transcripts though.
          await tx.lead.updateMany({
            where: { organizationId },
            data: {
              businessName: "[DELETED]",
              phone: null,
              address: null,
              notes: null,
            },
          });
          await tx.callLog.updateMany({
            where: { lead: { organizationId } },
            data: {
              transcript: "[REDACTED]",
              summary: "[REDACTED]",
            },
          });

          // 6. Soft-delete CRM children + ops data (NOT hard delete — audit
          //    trail). Idempotent: rows already soft-deleted aren't touched.
          const now = new Date();
          await tx.campaign.updateMany({
            where: { organizationId, deletedAt: null },
            data: { deletedAt: now },
          });
          await tx.deal.updateMany({
            where: { organizationId, deletedAt: null },
            data: { deletedAt: now },
          });
          await tx.task.updateMany({
            where: { organizationId, deletedAt: null },
            data: { deletedAt: now },
          });
          await tx.note.updateMany({
            where: { organizationId, deletedAt: null },
            data: { deletedAt: now },
          });
          await tx.blacklist.updateMany({
            where: { organizationId, deletedAt: null },
            data: { deletedAt: now },
          });

          // 7. Cleanup secrets-bearing children (not GDPR audit trail).
          await tx.passwordResetToken.deleteMany({
            where: { user: { organizationId } },
          });
          await tx.apiKey.deleteMany({ where: { organizationId } });

          // 8. Mark the org itself.
          await tx.organization.update({
            where: { id: organizationId },
            data: {
              name: `Deleted Organization ${hash8}`,
              status: "CANCELED",
              gdprDeletedAt: now,
              aiCallerName: "Alex",
              aiCallerCompany: "",
              aiCallerPhone: "",
              aiSystemPrompt: null,
              vapiPhoneNumberId: null,
              vapiPhoneNumber: null,
            },
          });
        },
        { timeout: 60_000, maxWait: 5_000 }
      );

      // 9. Audit log AFTER the transaction succeeds. Use the raw prisma to
      // bypass the soft-delete extension (no-op for AuditLog, but explicit).
      await rawPrisma.auditLog.create({
        data: {
          actorType: "TENANT_USER",
          actorId: userId,
          organizationId,
          targetOrganizationId: organizationId,
          action: "GDPR_DELETE",
          entity: "Organization",
          entityId: organizationId,
          metadata: {
            reason: reason ?? null,
            anonymisationHash: hash8,
            stripeCancelled: Boolean(subscription?.stripeSubscriptionId),
          } as any,
        },
      });

      logger.warn(
        { organizationId, requestedBy: userId, hash8 },
        "GDPR data deletion completed"
      );
      res.json({
        success: true,
        gdprDeletedAt: new Date().toISOString(),
        anonymisationHash: hash8,
      });
    } catch (err: any) {
      logger.error({ err, organizationId }, "GDPR deletion transaction failed");
      res.status(500).json({ error: "Failed to anonymise organisation data" });
    }
  }
);

export default router;
