import { platformFetch } from "@/lib/api";

export default async function EmailLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    organizationId?: string;
    recipient?: string;
    status?: string;
  }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.organizationId) qs.set("organizationId", sp.organizationId);
  if (sp.recipient) qs.set("recipient", sp.recipient);
  if (sp.status) qs.set("status", sp.status);
  const data = await platformFetch(`/emails?${qs.toString()}`);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Email log</h1>

      <form className="flex flex-wrap gap-2 items-end">
        <label className="text-xs text-slate-400">
          Organization ID
          <input
            name="organizationId"
            defaultValue={sp.organizationId ?? ""}
            className="block bg-slate-950 border border-slate-700 rounded p-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-400">
          Recipient
          <input
            name="recipient"
            defaultValue={sp.recipient ?? ""}
            className="block bg-slate-950 border border-slate-700 rounded p-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-400">
          Status
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="block bg-slate-950 border border-slate-700 rounded p-1 text-sm"
          >
            <option value="">All</option>
            <option value="SENT">SENT</option>
            <option value="FAILED">FAILED</option>
          </select>
        </label>
        <button className="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-sm">
          Filter
        </button>
      </form>

      <div className="bg-slate-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <th className="text-left p-3">Sent</th>
              <th className="text-left p-3">Recipient</th>
              <th className="text-left p-3">Subject</th>
              <th className="text-left p-3">Template</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Org</th>
              <th className="text-left p-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((e: any) => (
              <tr key={e.id} className="border-t border-slate-800">
                <td className="p-3 whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td className="p-3">{e.recipient}</td>
                <td className="p-3">{e.subject}</td>
                <td className="p-3 text-slate-400">{e.template ?? "—"}</td>
                <td className="p-3">
                  <span
                    className={
                      e.status === "SENT"
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  >
                    {e.status}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs">
                  {e.organizationId ?? "—"}
                </td>
                <td className="p-3 text-xs text-red-300 max-w-xs truncate">
                  {e.error ?? ""}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={7} className="p-3 text-slate-400">
                  No emails match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
