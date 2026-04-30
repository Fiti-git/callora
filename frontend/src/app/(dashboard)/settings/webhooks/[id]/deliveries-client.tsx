"use client";

import { useState, useTransition } from "react";
import {
  TenantWebhook,
  WebhookDelivery,
  redeliverWebhookDelivery,
} from "@/app/actions/webhooks";

export default function DeliveriesClient({
  webhook,
  initialDeliveries,
}: {
  webhook: TenantWebhook;
  initialDeliveries: { items: WebhookDelivery[]; nextCursor: string | null };
}) {
  const [items, setItems] = useState<WebhookDelivery[]>(initialDeliveries.items);
  const [busy, startTransition] = useTransition();

  function onRedeliver(deliveryId: string) {
    startTransition(async () => {
      try {
        await redeliverWebhookDelivery(webhook.id, deliveryId);
        alert("Redelivery queued.");
      } catch (err: any) {
        alert(err.message);
      }
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-700 dark:text-white">{webhook.url}</h1>
        <p className="text-sm text-gray-500">
          Subscribed events: {webhook.events.join(", ")}
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white dark:bg-navy-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-navy-700">
            <tr>
              <th className="p-3 text-left">Event</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Code</th>
              <th className="p-3 text-left">Attempts</th>
              <th className="p-3 text-left">When</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-400">
                  No deliveries yet.
                </td>
              </tr>
            )}
            {items.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="p-3">{d.event}</td>
                <td className="p-3">
                  <span
                    className={
                      d.status === "SUCCESS"
                        ? "text-green-700"
                        : d.status === "FAILED"
                        ? "text-red-700"
                        : "text-gray-600"
                    }
                  >
                    {d.status}
                  </span>
                </td>
                <td className="p-3">{d.responseCode ?? "-"}</td>
                <td className="p-3">{d.attempts}</td>
                <td className="p-3 text-xs text-gray-500">
                  {new Date(d.createdAt).toLocaleString()}
                </td>
                <td className="p-3 text-right">
                  {d.status === "FAILED" && (
                    <button
                      onClick={() => onRedeliver(d.id)}
                      disabled={busy}
                      className="text-xs text-brand-500"
                    >
                      Redeliver
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
