import { getWebhook, listDeliveries } from "@/app/actions/webhooks";
import DeliveriesClient from "./deliveries-client";

export const dynamic = "force-dynamic";

export default async function WebhookDetailPage({ params }: { params: { id: string } }) {
  const [webhook, deliveries] = await Promise.all([
    getWebhook(params.id),
    listDeliveries(params.id),
  ]);
  return <DeliveriesClient webhook={webhook} initialDeliveries={deliveries} />;
}
