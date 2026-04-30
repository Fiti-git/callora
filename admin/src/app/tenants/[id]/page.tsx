import { platformFetch } from "@/lib/api";
import StatusControls from "./StatusControls";
import AdminTools from "./AdminTools";
import BillingModeControl from "./BillingModeControl";

export default async function TenantDetail({ params }: { params: { id: string } }) {
  const [org, plans] = await Promise.all([
    platformFetch(`/organizations/${params.id}`),
    platformFetch(`/plans`),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">{org.name}</h1>
        <span className="text-slate-400">{org.id}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 rounded-xl p-4">
          <div className="text-slate-400 text-sm">Status</div>
          <div className="text-xl font-semibold">{org.status}</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-4">
          <div className="text-slate-400 text-sm">Plan</div>
          <div className="text-xl font-semibold">
            {org.subscription?.plan?.name ?? "—"}
            <span className="ml-2 text-sm text-slate-400">
              ({org.subscription?.status ?? "no sub"})
            </span>
          </div>
        </div>
      </div>

      <StatusControls orgId={org.id} currentStatus={org.status} plans={plans} currentPlanId={org.subscription?.planId} />

      <BillingModeControl orgId={org.id} currentBillingMode={org.billingMode} />

      <AdminTools orgId={org.id} />

      <section>
        <h2 className="text-xl font-semibold mb-3">Users</h2>
        <div className="bg-slate-900 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800"><tr>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Role</th>
            </tr></thead>
            <tbody>
              {org.users.map((u: any) => (
                <tr key={u.id} className="border-t border-slate-800">
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Recent Usage</h2>
        <div className="bg-slate-900 rounded-xl p-4">
          {org.usage.length === 0 ? (
            <p className="text-slate-400">No usage recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr>
                <th className="text-left">Period</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Leads</th>
                <th className="text-right">AI Tokens</th>
              </tr></thead>
              <tbody>
                {org.usage.map((u: any) => (
                  <tr key={u.id} className="border-t border-slate-800">
                    <td>{new Date(u.periodStart).toLocaleDateString()}</td>
                    <td className="text-right">{u.callsMade}</td>
                    <td className="text-right">{u.leadsScraped}</td>
                    <td className="text-right">{u.aiTokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
