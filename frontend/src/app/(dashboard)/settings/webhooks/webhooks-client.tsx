"use client";

import { useState, useTransition } from "react";
import {
  TenantWebhook,
  createWebhook,
  deleteWebhook,
  testWebhook,
  rotateWebhookSecret,
  updateWebhook,
} from "@/app/actions/webhooks";

const EVENTS = [
  "LEAD_QUALIFIED",
  "CALL_COMPLETED",
  "DEAL_WON",
  "CAMPAIGN_COMPLETED",
  "EMAIL_OPENED",
  "EMAIL_CLICKED",
];

export default function WebhooksClient({
  initial,
  error,
}: {
  initial: TenantWebhook[];
  error: string | null;
}) {
  const [webhooks, setWebhooks] = useState<TenantWebhook[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function toggleEvent(ev: string) {
    setSelectedEvents((s) => (s.includes(ev) ? s.filter((x) => x !== ev) : [...s, ev]));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!url || selectedEvents.length === 0) return;
    startTransition(async () => {
      try {
        const created = await createWebhook({ url, events: selectedEvents });
        setWebhooks((w) => [created, ...w]);
        setRevealedSecret(created.secret);
        setUrl("");
        setSelectedEvents([]);
        setShowCreate(false);
      } catch (err: any) {
        alert(err.message);
      }
    });
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this webhook? In-flight deliveries will fail.")) return;
    startTransition(async () => {
      await deleteWebhook(id);
      setWebhooks((w) => w.filter((x) => x.id !== id));
    });
  }

  async function onToggleActive(wh: TenantWebhook) {
    startTransition(async () => {
      await updateWebhook(wh.id, { active: !wh.active });
      setWebhooks((all) =>
        all.map((x) => (x.id === wh.id ? { ...x, active: !wh.active } : x))
      );
    });
  }

  async function onTest(id: string) {
    startTransition(async () => {
      try {
        await testWebhook(id);
        alert("Test ping queued. Check the deliveries page in a few seconds.");
      } catch (err: any) {
        alert(err.message);
      }
    });
  }

  async function onRotate(id: string) {
    if (!confirm("Rotate the signing secret? In-flight deliveries will keep using the old secret.")) return;
    startTransition(async () => {
      const { secret } = await rotateWebhookSecret(id);
      setRevealedSecret(secret);
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-700 dark:text-white">Webhooks</h1>
          <p className="text-sm text-gray-500">
            Send real-time event notifications to your own URLs.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600"
        >
          {showCreate ? "Cancel" : "Add Webhook"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {revealedSecret && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-900/20">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            Save this signing secret now — we will not show it again.
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-3 font-mono text-xs">
            {revealedSecret}
          </pre>
          <button
            onClick={() => {
              navigator.clipboard.writeText(revealedSecret);
            }}
            className="mt-2 rounded bg-amber-200 px-3 py-1 text-xs font-medium"
          >
            Copy
          </button>
          <button
            onClick={() => setRevealedSecret(null)}
            className="ml-2 mt-2 rounded bg-gray-200 px-3 py-1 text-xs font-medium"
          >
            I&apos;ve saved it
          </button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={onCreate} className="space-y-4 rounded-xl border bg-white p-4 dark:bg-navy-800">
          <div>
            <label className="mb-1 block text-sm font-medium">Webhook URL (https)</label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-10 w-full rounded border px-3 text-sm"
              placeholder="https://your-app.example.com/callora-webhook"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                  />
                  <code>{ev}</code>
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white"
          >
            Create
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border bg-white dark:bg-navy-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-navy-700">
            <tr>
              <th className="p-3 text-left">URL</th>
              <th className="p-3 text-left">Events</th>
              <th className="p-3 text-left">Active</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.length === 0 && (
              <tr>
                <td className="p-6 text-center text-gray-400" colSpan={4}>
                  No webhooks yet.
                </td>
              </tr>
            )}
            {webhooks.map((wh) => (
              <tr key={wh.id} className="border-t">
                <td className="max-w-xs truncate p-3">
                  <a className="text-brand-500 underline" href={`/settings/webhooks/${wh.id}`}>
                    {wh.url}
                  </a>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {wh.events.map((ev) => (
                      <span key={ev} className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                        {ev}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3">
                  <button
                    onClick={() => onToggleActive(wh)}
                    className={`rounded px-2 py-1 text-xs ${
                      wh.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {wh.active ? "Active" : "Paused"}
                  </button>
                </td>
                <td className="p-3 text-right space-x-2">
                  <button onClick={() => onTest(wh.id)} className="text-xs text-brand-500">
                    Test
                  </button>
                  <button onClick={() => onRotate(wh.id)} className="text-xs text-amber-600">
                    Rotate secret
                  </button>
                  <button onClick={() => onDelete(wh.id)} className="text-xs text-red-600">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
