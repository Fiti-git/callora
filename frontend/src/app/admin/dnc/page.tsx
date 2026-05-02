import { platformFetch } from "@/lib/platformApi";
import { addDncAction, removeDncAction } from "@/app/admin/actions";

type DncEntry = {
  id: string;
  phoneE164: string;
  source: string;
  addedAt: string;
  expiresAt: string | null;
};

type Props = {
  searchParams: Promise<{ q?: string; source?: string }>;
};

export default async function DncPage({ searchParams }: Props) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.source) qs.set("source", params.source);
  const path = qs.toString() ? `/dnc?${qs.toString()}` : "/dnc";

  const rows: DncEntry[] = await platformFetch(path);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">DNC List</h1>
      <p className="text-slate-400 text-sm mb-4">
        Platform-wide Do-Not-Call entries. Calls to these numbers are blocked
        across all tenants.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <form
          action={addDncAction}
          className="bg-slate-900 rounded-xl p-4 space-y-3"
        >
          <div className="text-sm font-semibold">Add DNC entry</div>
          <label className="block text-sm">
            <span className="block text-slate-400 mb-1">Phone (E.164)</span>
            <input
              name="phoneE164"
              placeholder="+14155550100"
              required
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-full"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-400 mb-1">Source</span>
            <input
              name="source"
              defaultValue="manual"
              placeholder="manual | ftc | complaint"
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-full"
            />
          </label>
          <button
            type="submit"
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-2 rounded text-sm font-semibold"
          >
            Add to DNC
          </button>
        </form>

        <form
          action="/dnc"
          method="get"
          className="bg-slate-900 rounded-xl p-4 space-y-3"
        >
          <div className="text-sm font-semibold">Filter</div>
          <label className="block text-sm">
            <span className="block text-slate-400 mb-1">Phone contains</span>
            <input
              name="q"
              defaultValue={params.q ?? ""}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-full"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-400 mb-1">Source</span>
            <input
              name="source"
              defaultValue={params.source ?? ""}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-full"
            />
          </label>
          <button
            type="submit"
            className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded text-sm font-semibold"
          >
            Apply Filter
          </button>
        </form>
      </div>

      <div className="bg-slate-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="text-left p-3">Phone</th>
              <th className="text-left p-3">Source</th>
              <th className="text-left p-3">Added</th>
              <th className="text-left p-3">Expires</th>
              <th className="text-right p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  No DNC entries match.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-800">
                <td className="p-3 font-mono">{row.phoneE164}</td>
                <td className="p-3 text-slate-300">{row.source}</td>
                <td className="p-3 text-xs text-slate-400">
                  {new Date(row.addedAt).toLocaleString()}
                </td>
                <td className="p-3 text-xs text-slate-400">
                  {row.expiresAt ? new Date(row.expiresAt).toLocaleString() : "—"}
                </td>
                <td className="p-3 text-right">
                  <form action={removeDncAction}>
                    <input type="hidden" name="phone" value={row.phoneE164} />
                    <button
                      type="submit"
                      className="bg-red-900 hover:bg-red-800 text-red-100 px-3 py-1 rounded text-xs"
                    >
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
