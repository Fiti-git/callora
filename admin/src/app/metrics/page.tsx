import { platformFetch } from "@/lib/api";

export default async function MetricsPage() {
  const data = await platformFetch("/metrics/mrr");

  const cards = [
    { label: "Total MRR", value: `$${data.totalMRR.toFixed(2)}` },
    { label: "New this month", value: data.newSubscriptionsThisMonth },
    { label: "Churned this month", value: data.churnedThisMonth },
    {
      label: "Churn rate",
      value: `${(data.churnRate * 100).toFixed(2)}%`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Revenue metrics</h1>
        {data.churnApproximate && (
          <p className="text-sm text-amber-400 mt-1">
            Churn is approximated from <code>updatedAt</code> + status=CANCELED
            until a status-history table lands.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-slate-900 rounded-xl p-4">
            <div className="text-slate-400 text-sm">{c.label}</div>
            <div className="text-2xl font-semibold mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-3">By plan</h2>
        <div className="bg-slate-900 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left p-3">Plan</th>
                <th className="text-left p-3">Tier</th>
                <th className="text-right p-3">Active subs</th>
                <th className="text-right p-3">MRR</th>
              </tr>
            </thead>
            <tbody>
              {data.breakdownByPlan.map((b: any) => (
                <tr key={b.tier} className="border-t border-slate-800">
                  <td className="p-3">{b.plan}</td>
                  <td className="p-3">{b.tier}</td>
                  <td className="p-3 text-right">{b.count}</td>
                  <td className="p-3 text-right">${b.mrr.toFixed(2)}</td>
                </tr>
              ))}
              {data.breakdownByPlan.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-3 text-slate-400">
                    No active subscriptions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
