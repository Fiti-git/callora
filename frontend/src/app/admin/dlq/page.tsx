import { platformFetch } from "@/lib/platformApi";
import DlqActions from "./DlqActions";

export default async function DlqPage() {
  const data = await platformFetch("/dlq");

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Dead-letter queue</h1>
        <span className="text-slate-400 text-sm">
          {data.total} failed jobs{data.capped ? " (capped at 200)" : ""}
        </span>
      </div>

      <div className="bg-slate-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <th className="text-left p-3">Queue</th>
              <th className="text-left p-3">Job ID</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Reason</th>
              <th className="text-left p-3">Attempts</th>
              <th className="text-left p-3">Failed at</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((j: any) => (
              <tr
                key={`${j.queue}:${j.jobId}`}
                className="border-t border-slate-800 align-top"
              >
                <td className="p-3 font-mono text-xs">{j.queue}</td>
                <td className="p-3 font-mono text-xs">{j.jobId}</td>
                <td className="p-3">{j.name}</td>
                <td className="p-3 text-xs text-red-300 max-w-md truncate">
                  {j.failedReason}
                </td>
                <td className="p-3">{j.attemptsMade}</td>
                <td className="p-3 whitespace-nowrap text-xs text-slate-400">
                  {j.finishedOn
                    ? new Date(j.finishedOn).toLocaleString()
                    : new Date(j.timestamp).toLocaleString()}
                </td>
                <td className="p-3">
                  <DlqActions queue={j.queue} jobId={j.jobId} />
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={7} className="p-3 text-slate-400">
                  No failed jobs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
