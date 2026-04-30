"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

const KINDS = ["VAPI_CALL", "PLACES", "GEMINI_TOKEN", "EMAIL"] as const;

/**
 * Per-tenant admin tools:
 *   1. Impersonate — issues a 15-minute tenant JWT and shows it in a copyable
 *      card (option-1 from the Phase-1 spec). The full URL-hash auto-login
 *      flow is left as a Phase-2 follow-up.
 *   2. Manual quota top-up — credits a counter on the current UsageRecord.
 */
export default function AdminTools({ orgId }: { orgId: string }) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken as string | undefined;
  const base =
    process.env.NEXT_PUBLIC_PLATFORM_API_URL ||
    "http://localhost:4000/api/platform";

  // Impersonation state
  const [impersonation, setImpersonation] = useState<{
    accessToken: string;
    expiresAt: string;
    user: { email: string };
  } | null>(null);
  const [impBusy, setImpBusy] = useState(false);
  const [impError, setImpError] = useState<string | null>(null);

  async function impersonate() {
    setImpBusy(true);
    setImpError(null);
    try {
      const res = await fetch(`${base}/impersonate/${orgId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      setImpersonation(await res.json());
    } catch (err: any) {
      setImpError(err.message);
    } finally {
      setImpBusy(false);
    }
  }

  // Quota credit state
  const [kind, setKind] = useState<(typeof KINDS)[number]>("VAPI_CALL");
  const [units, setUnits] = useState(100);
  const [reason, setReason] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditMsg, setCreditMsg] = useState<string | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);

  async function credit(e: React.FormEvent) {
    e.preventDefault();
    setCreditBusy(true);
    setCreditError(null);
    setCreditMsg(null);
    try {
      const res = await fetch(`${base}/orgs/${orgId}/quota/credit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ kind, units, reason }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      setCreditMsg(
        `Applied ${data.applied} units (${kind}: ${data.before} → ${data.after}).`
      );
      setReason("");
    } catch (err: any) {
      setCreditError(err.message);
    } finally {
      setCreditBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Impersonate */}
      <section className="bg-slate-900 rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Impersonation</h2>
        <p className="text-sm text-slate-400">
          Issues a 15-minute tenant JWT for a tenant admin user. Use only for
          break-glass support; every issuance is recorded in AuditLog.
        </p>
        <button
          onClick={impersonate}
          disabled={impBusy}
          className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-sm disabled:opacity-50"
        >
          {impBusy ? "Issuing…" : "Issue impersonation token"}
        </button>
        {impError && <p className="text-sm text-red-400">{impError}</p>}
        {impersonation && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              For <strong>{impersonation.user.email}</strong>, expires{" "}
              {new Date(impersonation.expiresAt).toLocaleTimeString()}.
            </p>
            <textarea
              readOnly
              value={impersonation.accessToken}
              className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded p-2 h-24"
            />
            <button
              onClick={() =>
                navigator.clipboard.writeText(impersonation.accessToken)
              }
              className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
            >
              Copy token
            </button>
          </div>
        )}
      </section>

      {/* Quota credit */}
      <section className="bg-slate-900 rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Manual quota top-up</h2>
        <p className="text-sm text-slate-400">
          Decrements the matching counter on this period&apos;s UsageRecord,
          freeing quota. Audited.
        </p>
        <form onSubmit={credit} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-400">
              Kind
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
                className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded p-1 text-sm"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Units
              <input
                type="number"
                min={1}
                value={units}
                onChange={(e) => setUnits(Number(e.target.value))}
                className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded p-1 text-sm"
              />
            </label>
          </div>
          <label className="text-xs text-slate-400 block">
            Reason
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded p-1 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={creditBusy || !reason}
            className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-50"
          >
            {creditBusy ? "Applying…" : "Apply credit"}
          </button>
        </form>
        {creditMsg && <p className="text-sm text-emerald-400">{creditMsg}</p>}
        {creditError && <p className="text-sm text-red-400">{creditError}</p>}
      </section>
    </div>
  );
}
