/**
 * Per-tenant webhook emit helper (Phase 3 Agent 12).
 *
 * `emitTenantEvent(orgId, event, payload)` looks up active TenantWebhook rows
 * subscribed to the given event, creates one WebhookDelivery row per match,
 * and enqueues a BullMQ job onto the `tenant-webhook-deliveries` queue.
 *
 * Best-effort by design: failures are logged but never thrown. The caller
 * (route handler / worker) shouldn't fail because the user's webhook is mis-
 * configured; the delivery row + delivery worker handle retry semantics.
 */
import prisma from "./prisma.js";
import { tenantWebhookQueue } from "./queue.js";
import { logger } from "./logger.js";
import { Sentry, sentryEnabled } from "./sentry.js";

export type TenantWebhookEvent =
  | "LEAD_QUALIFIED"
  | "CALL_COMPLETED"
  | "DEAL_WON"
  | "CAMPAIGN_COMPLETED"
  | "EMAIL_OPENED"
  | "EMAIL_CLICKED";

export async function emitTenantEvent(
  organizationId: string,
  event: TenantWebhookEvent,
  payload: Record<string, unknown>
): Promise<{ delivered: number }> {
  try {
    const webhooks = await prisma.tenantWebhook.findMany({
      where: {
        organizationId,
        active: true,
        events: { has: event as any },
      },
      select: { id: true },
    });
    if (webhooks.length === 0) return { delivered: 0 };

    const enriched = { event, organizationId, ...payload, emittedAt: new Date().toISOString() };

    for (const wh of webhooks) {
      const delivery = await prisma.webhookDelivery.create({
        data: {
          webhookId: wh.id,
          organizationId,
          event: event as any,
          payload: enriched as any,
          status: "PENDING",
        },
      });
      await tenantWebhookQueue.add(
        "deliver",
        { deliveryId: delivery.id },
        { jobId: `delivery:${delivery.id}` }
      );
    }
    return { delivered: webhooks.length };
  } catch (err) {
    logger.error({ err, organizationId, event }, "emitTenantEvent failed");
    if (sentryEnabled) Sentry.captureException(err);
    return { delivered: 0 };
  }
}
