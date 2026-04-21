"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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
  const { data: session } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [planId, setPlanId] = useState(currentPlanId ?? "");
  const [busy, setBusy] = useState(false);

  const base =
    process.env.NEXT_PUBLIC_PLATFORM_API_URL || "http://localhost:4000/api/platform";

  async function save(path: string, body: any) {
    setBusy(true);
    const token = (session as any)?.accessToken;
    await fetch(`${base}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
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
