import Link from "next/link";
import { platformFetch } from "@/lib/platformApi";
import { unsuspendOrgAction } from "@/app/admin/actions";

type Anomaly = {
  id: string;
  organizationId: string | null;
  organization: { id: string; name: string; status: string } | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export default async function AnomaliesPage() {
  const rows: Anomaly[] = await platformFetch("/risk/anomalies");

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Anomaly Alerts</h1>
      <p className="text-slate-400 text-sm mb-4">
        Auto-suspended organisations from risk-engine anomaly detection.
      </p>

      <div className="bg-slate-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="text-left p-3">When</th>
              <th className="text-left p-3">Organization</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Details</th>
              <th className="text-right p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  No anomaly events recorded.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isSuspended = row.organization?.status === "SUSPENDED";
              return (
                <tr key={row.id} className="border-t border-slate-800 align-top">
                  <td className="p-3 whitespace-nowrap text-slate-300">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {row.organizationId ? (
                      <Link
                        href={`/tenants/${row.organizationId}`}
                        className="text-cyan-400"
                      >
                        {row.organization?.name ?? row.organizationId.slice(0, 8) + "…"}
                      </Link>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={
                        isSuspended
                          ? "bg-red-900 text-red-200 px-2 py-0.5 rounded text-xs"
                          : "bg-emerald-900 text-emerald-200 px-2 py-0.5 rounded text-xs"
                      }
                    >
                      {row.organization?.status ?? "—"}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-400 max-w-md">
                    {row.metadata ? (
                      <code className="block truncate">{JSON.stringify(row.metadata)}</code>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {isSuspended && row.organizationId ? (
                      <form action={unsuspendOrgAction}>
                        <input type="hidden" name="orgId" value={row.organizationId} />
                        <button
                          type="submit"
                          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-1 rounded text-xs font-semibold"
                        >
                          Unsuspend
                        </button>
                      </form>
                    ) : (
                      <span className="text-slate-600 text-xs">resolved</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
