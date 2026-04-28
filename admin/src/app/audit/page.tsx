import Link from "next/link";
import { platformFetch } from "@/lib/api";

type AuditLog = {
  id: string;
  actorType: string;
  actorId: string | null;
  organizationId: string | null;
  action: string;
  target: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type Props = {
  searchParams: Promise<{
    organizationId?: string;
    actorType?: string;
    action?: string;
    cursor?: string;
  }>;
};

export default async function AuditPage({ searchParams }: Props) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.organizationId) qs.set("organizationId", params.organizationId);
  if (params.actorType) qs.set("actorType", params.actorType);
  if (params.action) qs.set("action", params.action);
  if (params.cursor) qs.set("cursor", params.cursor);
  qs.set("limit", "50");

  const data: { items: AuditLog[]; nextCursor: string | null } = await platformFetch(
    `/audit?${qs.toString()}`
  );

  const filterHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams(qs);
    next.delete("cursor");
    for (const [k, v] of Object.entries(overrides)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    return `/audit?${next.toString()}`;
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Audit Log</h1>

      <form className="mb-4 flex gap-2 items-end flex-wrap" action="/audit" method="get">
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">Organization ID</span>
          <input
            name="organizationId"
            defaultValue={params.organizationId ?? ""}
            placeholder="cuid"
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm w-64"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">Actor</span>
          <select
            name="actorType"
            defaultValue={params.actorType ?? ""}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
          >
            <option value="">Any</option>
            <option value="PLATFORM_USER">Platform user</option>
            <option value="TENANT_USER">Tenant user</option>
            <option value="SYSTEM">System</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">Action contains</span>
          <input
            name="action"
            defaultValue={params.action ?? ""}
            placeholder="billing.checkout"
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm w-56"
          />
        </label>
        <button className="bg-cyan-600 hover:bg-cyan-500 px-3 py-1 rounded text-sm font-medium">
          Filter
        </button>
        {(params.organizationId || params.actorType || params.action) && (
          <Link href="/audit" className="text-slate-400 hover:text-slate-200 text-sm">
            Clear
          </Link>
        )}
      </form>

      <div className="bg-slate-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="text-left p-3">When</th>
              <th className="text-left p-3">Actor</th>
              <th className="text-left p-3">Action</th>
              <th className="text-left p-3">Target</th>
              <th className="text-left p-3">Org</th>
              <th className="text-left p-3">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-500">
                  No audit entries match these filters.
                </td>
              </tr>
            )}
            {data.items.map((row) => (
              <tr key={row.id} className="border-t border-slate-800 align-top">
                <td className="p-3 whitespace-nowrap text-slate-300">
                  {new Date(row.createdAt).toLocaleString()}
                </td>
                <td className="p-3 whitespace-nowrap">
                  <div className="text-slate-200">{row.actorType}</div>
                  <div className="text-xs text-slate-500">{row.actorId ?? "—"}</div>
                </td>
                <td className="p-3 font-mono text-xs">{row.action}</td>
                <td className="p-3 text-slate-400 text-xs">{row.target ?? "—"}</td>
                <td className="p-3 text-xs">
                  {row.organizationId ? (
                    <Link href={`/tenants/${row.organizationId}`} className="text-cyan-400">
                      {row.organizationId.slice(0, 8)}…
                    </Link>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="p-3 text-xs text-slate-400 max-w-xs overflow-hidden">
                  {row.metadata ? (
                    <code className="block truncate">{JSON.stringify(row.metadata)}</code>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.nextCursor && (
        <div className="mt-4">
          <Link
            href={filterHref({ cursor: data.nextCursor })}
            className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded text-sm"
          >
            Load more
          </Link>
        </div>
      )}
    </div>
  );
}
