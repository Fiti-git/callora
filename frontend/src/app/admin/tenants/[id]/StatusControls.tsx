"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { platformPatch } from "../../actions/platformProxy";

const STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"];

export default function StatusControls({
  orgId,
  currentStatus,
  plans,
  currentPlanId,
}: {
  orgId: string;
  currentStatus: string;
  plans: any[];
  currentPlanId?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [planId, setPlanId] = useState(currentPlanId ?? "");
  const [busy, setBusy] = useState(false);

  async function save(path: string, body: any) {
    setBusy(true);
    const r = await platformPatch(path, body);
    setBusy(false);
    if (!r.ok) alert(r.error);
    else router.refresh();
  }

  return (
    <div className="bg-slate-900 rounded-xl p-4 space-y-4">
      <h2 className="text-lg font-semibold">Controls</h2>
      <div className="flex gap-2 items-center">
        <label className="text-sm text-slate-400 w-20">Status</label>
        <select
          className="bg-slate-800 p-2 rounded"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button
          disabled={busy}
          onClick={() => save(`/organizations/${orgId}/status`, { status })}
          className="bg-cyan-500 text-slate-950 px-3 py-2 rounded font-semibold"
        >
          Apply Status
        </button>
      </div>
      <div className="flex gap-2 items-center">
        <label className="text-sm text-slate-400 w-20">Plan</label>
        <select
          className="bg-slate-800 p-2 rounded"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
        >
          <option value="">—</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.tier})
            </option>
          ))}
        </select>
        <button
          disabled={busy || !planId}
          onClick={() => save(`/organizations/${orgId}/plan`, { planId })}
          className="bg-cyan-500 text-slate-950 px-3 py-2 rounded font-semibold"
        >
          Apply Plan
        </button>
      </div>
    </div>
  );
}
