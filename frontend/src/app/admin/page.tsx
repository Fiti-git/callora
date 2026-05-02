import { platformFetch } from "@/lib/platformApi";

export default async function Dashboard() {
  const metrics = await platformFetch("/metrics");
  const cards = [
    { label: "Total Tenants", value: metrics.totalOrgs },
    { label: "Active", value: metrics.activeOrgs },
    { label: "Trialing", value: metrics.trialingOrgs },
    { label: "Past Due", value: metrics.pastDueOrgs },
    { label: "Suspended", value: metrics.suspendedOrgs },
    { label: "MRR", value: `$${(metrics.mrrCents / 100).toFixed(2)}` },
    { label: "Trials Expiring (7d)", value: metrics.trialsExpiringSoon },
  ];
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Platform Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-slate-900 rounded-xl p-4">
            <div className="text-slate-400 text-sm">{c.label}</div>
            <div className="text-2xl font-semibold mt-1">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
