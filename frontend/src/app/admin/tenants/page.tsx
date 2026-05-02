import Link from "next/link";
import { platformFetch } from "@/lib/platformApi";

export default async function TenantsPage() {
  const orgs: any[] = await platformFetch("/organizations");
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Tenants</h1>
      <div className="bg-slate-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Plan</th>
              <th className="text-right p-3">Users</th>
              <th className="text-right p-3">Campaigns</th>
              <th className="text-right p-3">Leads</th>
              <th className="text-left p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-t border-slate-800 hover:bg-slate-800/50">
                <td className="p-3">
                  <Link className="text-cyan-400" href={`/tenants/${o.id}`}>
                    {o.name}
                  </Link>
                </td>
                <td className="p-3">{o.status}</td>
                <td className="p-3">{o.subscription?.plan?.tier ?? "—"}</td>
                <td className="p-3 text-right">{o._count?.users ?? 0}</td>
                <td className="p-3 text-right">{o._count?.campaigns ?? 0}</td>
                <td className="p-3 text-right">{o._count?.leads ?? 0}</td>
                <td className="p-3">{new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
