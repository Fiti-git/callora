/**
 * Per-tenant webhook emit helper. Mirrored from backend/src/lib/webhookEmit.ts.
 * Best-effort: never throws.
 */
import { prisma } from "@callora/shared";
import { tenantWebhookQueue } from "./queue.js";

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
    console.error("[notification-service] emitTenantEvent failed:", err);
    return { delivered: 0 };
  }
}
