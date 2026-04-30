"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const MODES = ["PAYG", "SUBSCRIPTION", "BYOK"] as const;
type Mode = (typeof MODES)[number];

interface Props {
  orgId: string;
  currentBillingMode: Mode | string | null | undefined;
}

/**
 * Phase 5 Agent M7 — admin BYOK toggle.
 *
 * Super-admins can flip a tenant's billingMode and (for BYOK) paste the
 * four vendor API keys. Existing keys are stored encrypted at rest and
 * are NEVER read back to this UI; blank fields preserve the current key.
 *
 * The PATCH /api/platform/organizations/:orgId/billing-mode endpoint
 * (M1) is the only path to change billingMode. It validates and audits
 * the change end-to-end, including the optional encrypted-keys upsert.
 */
export default function BillingModeControl({ orgId, currentBillingMode }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const token = (session as any)?.accessToken as string | undefined;
  const base =
    process.env.NEXT_PUBLIC_PLATFORM_API_URL ||
    "http://localhost:4000/api/platform";

  const [mode, setMode] = useState<Mode>(
    (currentBillingMode as Mode) ?? "PAYG"
  );
  const [reason, setReason] = useState("");
  const [vapiPrivateKey, setVapiPrivateKey] = useState("");
  const [vapiPhoneNumberId, setVapiPhoneNumberId] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [googleMapsKey, setGoogleMapsKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<{
    when: string;
    summary: string;
  } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const apiKeys: Record<string, string> = {};
    if (mode === "BYOK") {
      if (vapiPrivateKey) apiKeys.vapiPrivateKey = vapiPrivateKey;
      if (vapiPhoneNumberId) apiKeys.vapiPhoneNumberId = vapiPhoneNumberId;
      if (geminiApiKey) apiKeys.geminiApiKey = geminiApiKey;
      if (googleMapsKey) apiKeys.googleMapsKey = googleMapsKey;
    }

    const body: any = { billingMode: mode, reason };
    if (Object.keys(apiKeys).length > 0) body.apiKeys = apiKeys;

    try {
      const res = await fetch(`${base}/organizations/${orgId}/billing-mode`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const data = await res.json();
      setLastChange({
        when: new Date().toLocaleString(),
        summary: `Mode set to ${data.organization.billingMode}${
          data.keysProvided ? " with new BYOK keys" : ""
        } — reason: ${reason}`,
      });
      setReason("");
      setVapiPrivateKey("");
      setVapiPhoneNumberId("");
      setGeminiApiKey("");
      setGoogleMapsKey("");
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Failed to update billing mode");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-slate-900 rounded-xl p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Billing mode</h2>
        <span className="text-xs text-slate-400">
          Current: <strong>{currentBillingMode ?? "—"}</strong>
        </span>
      </div>
      <p className="text-sm text-slate-400">
        Flip a tenant between PAYG, SUBSCRIPTION (dormant), or BYOK. BYOK
        requires the tenant&apos;s vendor keys; we encrypt at rest.
        Audited via AuditLog (BILLING_MODE_CHANGED).
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-400">
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm"
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Reason (required)
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="e.g. Customer requested BYOK migration"
              className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm"
            />
          </label>
        </div>

        {mode === "BYOK" && (
          <div className="space-y-2 border border-slate-700 rounded p-3">
            <p className="text-xs text-slate-400">
              Keys are encrypted at rest. Leave a field blank to keep the
              tenant&apos;s current key.
            </p>
            <label className="text-xs text-slate-400 block">
              Vapi private key
              <input
                type="password"
                autoComplete="off"
                value={vapiPrivateKey}
                onChange={(e) => setVapiPrivateKey(e.target.value)}
                placeholder="(unchanged)"
                className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm font-mono"
              />
            </label>
            <label className="text-xs text-slate-400 block">
              Vapi phone number id
              <input
                type="password"
                autoComplete="off"
                value={vapiPhoneNumberId}
                onChange={(e) => setVapiPhoneNumberId(e.target.value)}
                placeholder="(unchanged)"
                className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm font-mono"
              />
            </label>
            <label className="text-xs text-slate-400 block">
              Gemini API key
              <input
                type="password"
                autoComplete="off"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="(unchanged)"
                className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm font-mono"
              />
            </label>
            <label className="text-xs text-slate-400 block">
              Google Maps / Places key
              <input
                type="password"
                autoComplete="off"
                value={googleMapsKey}
                onChange={(e) => setGoogleMapsKey(e.target.value)}
                placeholder="(unchanged)"
                className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm font-mono"
              />
            </label>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !reason}
          className="px-3 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Applying..." : "Apply billing mode"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {lastChange && (
          <p className="text-xs text-emerald-400">
            {lastChange.when}: {lastChange.summary}
          </p>
        )}
      </form>
    </section>
  );
}
