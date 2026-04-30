import { fetchWithAuth } from "@/lib/api";
import { DealBoard } from "@/components/deal-board";
import { DealsBulkList } from "@/components/deals-bulk-list";

const STAGES = ["PROSPECT", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;

export default async function PipelinePage() {
  let deals: any[] = [];
  try {
    deals = await fetchWithAuth("/deals");
  } catch {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        Failed to load pipeline. Please refresh the page.
      </div>
    );
  }

  const byStage = STAGES.reduce(
    (acc, stage) => {
      acc[stage] = deals.filter((d: any) => d.stage === stage);
      return acc;
    },
    {} as Record<string, any[]>
  );

  const totalValue = deals
    .filter((d) => !["WON", "LOST"].includes(d.stage))
    .reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Pipeline</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {deals.length} deals · ${totalValue.toLocaleString()} pipeline value
          </p>
        </div>
        <DealBoard mode="create-button" />
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <KanbanColumn key={stage} stage={stage} deals={byStage[stage]} />
        ))}
      </div>

      {/* Bulk list (Phase 2 Agent 7) — table view with multi-select. */}
      {deals.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">All deals (bulk)</h2>
          <DealsBulkList deals={deals} />
        </div>
      ) : null}
    </div>
  );
}

const STAGE_STYLES: Record<string, { header: string; dot: string }> = {
  PROSPECT: { header: "text-gray-600 dark:text-gray-400", dot: "bg-gray-400" },
  QUALIFIED: { header: "text-blue-600 dark:text-blue-400", dot: "bg-blue-400" },
  PROPOSAL: { header: "text-yellow-600 dark:text-yellow-400", dot: "bg-yellow-400" },
  NEGOTIATION: { header: "text-orange-600 dark:text-orange-400", dot: "bg-orange-400" },
  WON: { header: "text-green-600 dark:text-green-400", dot: "bg-green-400" },
  LOST: { header: "text-red-500 dark:text-red-400", dot: "bg-red-400" },
};

function KanbanColumn({ stage, deals }: { stage: string; deals: any[] }) {
  const style = STAGE_STYLES[stage] || STAGE_STYLES.PROSPECT;
  const colValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <div className="flex-shrink-0 w-64">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${style.dot}`} />
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${style.header}`}>
          {stage}
        </h3>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{deals.length}</span>
      </div>
      {colValue > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">${colValue.toLocaleString()}</p>
      )}
      <div className="space-y-2 min-h-20">
        {deals.map((deal) => (
          <DealBoard key={deal.id} mode="card" deal={deal} />
        ))}
      </div>
    </div>
  );
}
