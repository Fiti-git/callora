import { fetchWithAuth } from "@/lib/api";

interface AuditRow {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: any;
  createdAt: string;
}

/**
 * /settings/audit-log — paginated tenant audit-log viewer. Org-scoped via
 * the backend's `targetOrganizationId` filter, so users only see actions
 * affecting their own organisation.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const cursor = searchParams.cursor;
  const entity = searchParams.entity;
  const action = searchParams.action;

  const qs = new URLSearchParams();
  qs.set("limit", "50");
  if (cursor) qs.set("cursor", cursor);
  if (entity) qs.set("entity", entity);
  if (action) qs.set("action", action);

  let data: { items: AuditRow[]; nextCursor: string | null } = {
    items: [],
    nextCursor: null,
  };
  let error: string | null = null;
  try {
    data = await fetchWithAuth(`/audit-log?${qs.toString()}`);
  } catch (err: any) {
    error = err?.message ?? "Failed to load audit log";
  }

  return (
    <div className="mt-3 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
          Audit log
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Every mutation (create / update / delete / status change) on your
          organisation's data, in reverse chronological order.
        </p>
      </div>

      <form method="GET" className="flex gap-2">
        <input
          name="entity"
          defaultValue={entity ?? ""}
          placeholder="Entity (Lead, Contact, …)"
          className="rounded-md border px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-900"
        />
        <input
          name="action"
          defaultValue={action ?? ""}
          placeholder="Action contains…"
          className="rounded-md border px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-900"
        />
        <button
          type="submit"
          className="rounded-md bg-brand-500 px-4 py-2 text-sm text-white"
        >
          Filter
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border bg-white dark:border-navy-700 dark:bg-navy-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 dark:bg-navy-900">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Diff</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  No audit-log entries.
                </td>
              </tr>
            )}
            {data.items.map((r) => (
              <tr
                key={r.id}
                className="border-t border-gray-100 dark:border-navy-700"
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono dark:bg-navy-700">
                    {r.actorType}
                  </span>{" "}
                  <span className="font-mono text-xs">{r.actorId}</span>
                </td>
                <td className="px-3 py-2 font-medium">{r.action}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.entity ?? "-"}
                  {r.entityId ? `:${r.entityId.slice(0, 8)}…` : ""}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.metadata?.diff
                    ? JSON.stringify(r.metadata.diff)
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.nextCursor && (
        <div>
          <a
            href={`?cursor=${data.nextCursor}${
              entity ? `&entity=${encodeURIComponent(entity)}` : ""
            }${action ? `&action=${encodeURIComponent(action)}` : ""}`}
            className="rounded-md border px-4 py-2 text-sm dark:border-navy-600"
          >
            Next page →
          </a>
        </div>
      )}
    </div>
  );
}
