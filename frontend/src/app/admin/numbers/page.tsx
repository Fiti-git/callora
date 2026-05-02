import { platformFetch } from "@/lib/platformApi";
import { addPoolNumberAction, rotatePoolNumberAction } from "@/app/admin/actions";

type PoolNumber = {
  id: string;
  e164: string;
  areaCode: string | null;
  spamScore: number | null;
  lastRotatedAt: string | null;
  provisionedAt: string;
  status: string;
  vapiPhoneNumberId: string;
};

export default async function NumbersPage() {
  const rows: PoolNumber[] = await platformFetch("/numbers/pool");

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Phone Number Pool</h1>

      <form
        action={addPoolNumberAction}
        className="mb-6 bg-slate-900 rounded-xl p-4 flex gap-2 items-end"
      >
        <label className="text-sm">
          <span className="block text-slate-400 mb-1">Area code</span>
          <input
            name="areaCode"
            placeholder="415"
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-32"
          />
        </label>
        <button
          type="submit"
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-2 rounded text-sm font-semibold"
        >
          Add Pool Number
        </button>
        <p className="text-xs text-slate-500 ml-3">
          Buys a new Vapi number and adds it to the rotation pool.
        </p>
      </form>

      <div className="bg-slate-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="text-left p-3">E.164</th>
              <th className="text-left p-3">Area Code</th>
              <th className="text-right p-3">Spam Score</th>
              <th className="text-left p-3">Last Rotated</th>
              <th className="text-left p-3">Provisioned</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500">
                  Pool is empty. Add a number above.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-800 align-top">
                <td className="p-3 font-mono">{r.e164}</td>
                <td className="p-3 text-slate-300">{r.areaCode ?? "—"}</td>
                <td className="p-3 text-right">
                  {r.spamScore !== null ? r.spamScore.toFixed(2) : "—"}
                </td>
                <td className="p-3 text-slate-400 text-xs">
                  {r.lastRotatedAt
                    ? new Date(r.lastRotatedAt).toLocaleString()
                    : "—"}
                </td>
                <td className="p-3 text-slate-400 text-xs">
                  {new Date(r.provisionedAt).toLocaleString()}
                </td>
                <td className="p-3">{r.status}</td>
                <td className="p-3 text-right">
                  <form action={rotatePoolNumberAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded text-xs"
                    >
                      Rotate
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
