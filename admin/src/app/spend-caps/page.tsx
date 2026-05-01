import Link from "next/link";
import { platformFetch } from "@/lib/api";
import { updateSpendCapAction } from "@/app/actions";

type Props = {
  searchParams: Promise<{ orgId?: string }>;
};

type SpendCap = {
  id: string;
  organizationId: string;
  dailyCapCents: number;
  monthlyCapCents: number;
  currentDayCents: number;
  currentMonthCents: number;
  lastDayResetAt: string;
  lastMonthResetAt: string;
} | null;

export default async function SpendCapsPage({ searchParams }: Props) {
  const params = await searchParams;
  const orgId = params.orgId?.trim() || "";

  let result:
    | { organization: { id: string; name: string }; spendCap: SpendCap }
    | null = null;
  let loadError: string | null = null;
  if (orgId) {
    try {
      result = await platformFetch(`/spend-cap/${encodeURIComponent(orgId)}`);
    } catch (err: any) {
      loadError = err?.message || "Failed to load";
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Spend Cap Overrides</h1>

      <form
        action="/spend-caps"
        method="get"
        className="mb-6 bg-slate-900 rounded-xl p-4 flex gap-2 items-end"
      >
        <label className="text-sm flex-1">
          <span className="block text-slate-400 mb-1">Organization ID</span>
          <input
            name="orgId"
            defaultValue={orgId}
            placeholder="cuid"
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-full"
          />
        </label>
        <button
          type="submit"
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-2 rounded text-sm font-semibold"
        >
          Load
        </button>
        {orgId && (
          <Link href="/spend-caps" className="text-slate-400 hover:text-slate-200 text-sm">
            Clear
          </Link>
        )}
      </form>

      {loadError && (
        <div className="bg-red-950 border border-red-800 text-red-200 p-4 rounded mb-6">
          {loadError}
        </div>
      )}

      {result && (
        <div className="bg-slate-900 rounded-xl p-6 space-y-6 max-w-2xl">
          <div>
            <div className="text-xs text-slate-500 uppercase">Organization</div>
            <div className="text-lg font-semibold">{result.organization.name}</div>
            <div className="text-xs text-slate-500 font-mono">{result.organization.id}</div>
          </div>

          {result.spendCap && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-400">Current Day</div>
                <div className="text-lg">
                  ${(result.spendCap.currentDayCents / 100).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Current Month</div>
                <div className="text-lg">
                  ${(result.spendCap.currentMonthCents / 100).toFixed(2)}
                </div>
              </div>
            </div>
          )}

          <form action={updateSpendCapAction} className="space-y-4">
            <input type="hidden" name="orgId" value={result.organization.id} />
            <label className="block text-sm">
              <span className="block text-slate-400 mb-1">
                Daily Cap (cents)
              </span>
              <input
                name="dailyCapCents"
                type="number"
                min="0"
                defaultValue={result.spendCap?.dailyCapCents ?? 0}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-full"
              />
            </label>
            <label className="block text-sm">
              <span className="block text-slate-400 mb-1">
                Monthly Cap (cents)
              </span>
              <input
                name="monthlyCapCents"
                type="number"
                min="0"
                defaultValue={result.spendCap?.monthlyCapCents ?? 0}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-full"
              />
            </label>
            <button
              type="submit"
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-2 rounded text-sm font-semibold"
            >
              Save Spend Cap
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
