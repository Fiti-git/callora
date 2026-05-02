"use client";

import { useState } from "react";
import { platformPost } from "../../actions/platformProxy";

const KINDS = ["VAPI_CALL", "PLACES", "GEMINI_TOKEN", "EMAIL"] as const;

export default function AdminTools({ orgId }: { orgId: string }) {
  const [impersonation, setImpersonation] = useState<any>(null);
  const [impBusy, setImpBusy] = useState(false);
  const [impError, setImpError] = useState<string | null>(null);

  async function impersonate() {
    setImpBusy(true);
    setImpError(null);
    const r = await platformPost(`/impersonate/${orgId}`);
    setImpBusy(false);
    if (!r.ok) setImpError(r.error);
    else setImpersonation(r.data);
  }

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
    const r = await platformPost(`/orgs/${orgId}/quota/credit`, {
      kind,
      units,
      reason,
    });
    setCreditBusy(false);
    if (!r.ok) {
      setCreditError(r.error);
    } else {
      setCreditMsg(
        `Applied ${r.data.applied} units (${kind}: ${r.data.before} → ${r.data.after}).`
      );
      setReason("");
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <section className="bg-slate-900 rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Impersonation</h2>
        <p className="text-sm text-slate-400">
          15-min tenant JWT. Audit-logged. Break-glass only.
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
          </div>
        )}
      </section>

      <section className="bg-slate-900 rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Quota Credit</h2>
        <form onSubmit={credit} className="space-y-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as any)}
            className="w-full bg-slate-800 p-2 rounded"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={units}
            onChange={(e) => setUnits(Number(e.target.value))}
            className="w-full bg-slate-800 p-2 rounded"
            min={1}
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (audit log)"
            className="w-full bg-slate-800 p-2 rounded"
          />
          <button
            disabled={creditBusy}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-3 py-2 rounded text-sm disabled:opacity-50"
          >
            {creditBusy ? "Crediting…" : "Apply Credit"}
          </button>
        </form>
        {creditError && <p className="text-sm text-red-400">{creditError}</p>}
        {creditMsg && <p className="text-sm text-emerald-400">{creditMsg}</p>}
      </section>
    </div>
  );
}
