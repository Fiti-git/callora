import { platformFetch } from "@/lib/platformApi";

export default async function PlansPage() {
  const plans: any[] = await platformFetch("/plans");
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Plans</h1>
      <div className="bg-slate-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <th className="text-left p-3">Tier</th>
              <th className="text-left p-3">Name</th>
              <th className="text-right p-3">Price</th>
              <th className="text-right p-3">Call Quota</th>
              <th className="text-right p-3">Lead Quota</th>
              <th className="text-right p-3">Seats</th>
              <th className="text-left p-3">Stripe Price ID</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className="p-3 font-semibold">{p.tier}</td>
                <td className="p-3">{p.name}</td>
                <td className="p-3 text-right">${(p.priceCents / 100).toFixed(2)}</td>
                <td className="p-3 text-right">{p.monthlyCallQuota}</td>
                <td className="p-3 text-right">{p.monthlyLeadQuota}</td>
                <td className="p-3 text-right">{p.seatLimit}</td>
                <td className="p-3 text-slate-400">{p.stripePriceId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-slate-500 text-sm mt-3">
        Plan editing requires super-admin; use <code>PUT /api/platform/plans/:tier</code> or the API client.
      </p>
    </div>
  );
}
