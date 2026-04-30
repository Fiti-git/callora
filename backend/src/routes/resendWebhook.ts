/**
 * Resend webhook (Phase 2 Agent 9).
 *
 *   POST /api/email/webhook/resend
 *
 * Mounted BEFORE express.json() — like Stripe and Vapi — because the raw body
 * is required to verify the HMAC signature.
 *
 * Idempotency: keyed on Resend's `event.data.id` (or the top-level `id`)
 * via the ResendWebhookEvent table.
 *
 * Handles:
 *   - email.bounced     → suppression reason BOUNCED   + EmailLog.status=BOUNCED
 *   - email.complained  → suppression reason COMPLAINED (platform-wide)
 *                        + EmailLog.status=COMPLAINED
 *   - email.delivered   → EmailLog.status=DELIVERED (no suppression)
 */
import express, { Request, Response } from "express";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { emitTenantEvent } from "../lib/webhookEmit.js";

const router = express.Router();

function verifySignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  // Constant-time compare; tolerate `sha256=` prefix.
  const sig = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.post(
  "/webhook/resend",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req: Request, res: Response) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ error: "RESEND_WEBHOOK_SECRET not set" });

    const raw = req.body as Buffer;
    if (!Buffer.isBuffer(raw)) return res.status(400).json({ error: "invalid_body" });

    const signature =
      (req.headers["resend-signature"] as string | undefined) ||
      (req.headers["x-resend-signature"] as string | undefined) ||
      (req.headers["svix-signature"] as string | undefined);

    if (!verifySignature(raw, signature, secret)) {
      return res.status(400).json({ error: "invalid_signature" });
    }

    let event: any;
    try {
      event = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "invalid_json" });
    }

    const eventId: string | undefined = event?.id || event?.data?.id || event?.data?.email_id;
    const type: string = event?.type || "unknown";
    if (!eventId) return res.status(400).json({ error: "missing_event_id" });

    // Idempotency.
    const existing = await prisma.resendWebhookEvent.findUnique({ where: { id: eventId } });
    if (existing?.processedAt) {
      return res.status(200).json({ received: true, idempotent: true });
    }
    await prisma.resendWebhookEvent.upsert({
      where: { id: eventId },
      update: { type },
      create: { id: eventId, type },
    });

    try {
      const data = event?.data ?? {};
      const recipient: string = (data.to || data.email || "").toString().toLowerCase();
      const providerMessageId: string | undefined = data.email_id || data.id || data.message_id;

      // Locate matching EmailLog row to discover the orgId.
      let emailLog = providerMessageId
        ? await prisma.emailLog.findFirst({ where: { providerMessageId } })
        : null;
      if (!emailLog && recipient) {
        emailLog = await prisma.emailLog.findFirst({
          where: { recipient },
          orderBy: { createdAt: "desc" },
        });
      }
      const orgId = emailLog?.organizationId ?? null;

      if (type === "email.bounced" || type === "email.delivery_delayed") {
        if (recipient) {
          await prisma.emailSuppression.upsert({
            where: { email_organizationId: { email: recipient, organizationId: orgId as string } },
            update: { reason: "BOUNCED", source: "RESEND_WEBHOOK" },
            create: {
              email: recipient,
              organizationId: orgId,
              reason: "BOUNCED",
              source: "RESEND_WEBHOOK",
            },
          });
        }
        if (emailLog) {
          await prisma.emailLog.update({ where: { id: emailLog.id }, data: { status: "BOUNCED" } });
        }
      } else if (type === "email.complained") {
        if (recipient) {
          // Spam complaints suppress platform-wide.
          await prisma.emailSuppression.upsert({
            where: { email_organizationId: { email: recipient, organizationId: null as any } },
            update: { reason: "COMPLAINED", source: "RESEND_WEBHOOK" },
            create: {
              email: recipient,
              organizationId: null,
              reason: "COMPLAINED",
              source: "RESEND_WEBHOOK",
            },
          });
        }
        if (emailLog) {
          await prisma.emailLog.update({ where: { id: emailLog.id }, data: { status: "COMPLAINED" } });
        }
      } else if (type === "email.delivered" && emailLog) {
        await prisma.emailLog.update({ where: { id: emailLog.id }, data: { status: "DELIVERED" } });
      }

      // Phase 3 Agent 10 — also reflect engagement events on EmailSend rows
      // so per-campaign analytics stay in sync. Idempotency on this whole
      // handler is via ResendWebhookEvent above.
      if (providerMessageId) {
        const send = await prisma.emailSend.findUnique({
          where: { providerMessageId },
        });
        if (send) {
          const now = new Date();
          let sendUpdate: any = null;
          let campaignField: string | null = null;
          if (type === "email.delivered" && !send.deliveredAt) {
            sendUpdate = { deliveredAt: now, status: "DELIVERED" };
            campaignField = "totalDelivered";
          } else if (type === "email.opened" && !send.openedAt) {
            sendUpdate = { openedAt: now, status: "OPENED" };
            campaignField = "totalOpened";
          } else if (type === "email.clicked" && !send.clickedAt) {
            sendUpdate = { clickedAt: now, status: "CLICKED" };
            campaignField = "totalClicked";
          } else if (type === "email.bounced" && !send.bouncedAt) {
            sendUpdate = { bouncedAt: now, status: "BOUNCED" };
            campaignField = "totalBounced";
          } else if (type === "email.complained" && !send.complainedAt) {
            sendUpdate = { complainedAt: now, status: "COMPLAINED" };
            campaignField = "totalComplained";
          } else if (
            (type === "email.unsubscribed" || type === "contact.unsubscribed") &&
            !send.unsubscribedAt
          ) {
            sendUpdate = { unsubscribedAt: now, status: "UNSUBSCRIBED" };
            campaignField = "totalUnsubscribed";
          }
          if (sendUpdate) {
            await prisma.emailSend.update({ where: { id: send.id }, data: sendUpdate });
            if (campaignField) {
              await prisma.emailCampaign.update({
                where: { id: send.campaignId },
                data: { [campaignField]: { increment: 1 } } as any,
              });
            }
          }
        }
      }

      // Phase 3 Agent 12 — fire EMAIL_OPENED / EMAIL_CLICKED tenant webhooks.
      // Best-effort; emitTenantEvent swallows errors.
      if (orgId && (type === "email.opened" || type === "email.clicked")) {
        await emitTenantEvent(
          orgId,
          type === "email.opened" ? "EMAIL_OPENED" : "EMAIL_CLICKED",
          {
            recipient,
            providerMessageId: providerMessageId ?? null,
          }
        );
      }

      await prisma.resendWebhookEvent.update({
        where: { id: eventId },
        data: { processedAt: new Date() },
      });

      return res.status(200).json({ received: true });
    } catch (err: any) {
      // Don't mark processedAt — let Resend retry.
      console.error("[resend-webhook] handler error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

export default router;
