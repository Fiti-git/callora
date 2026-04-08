import { fetchWithAuth } from "@/lib/api";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { DealBoard } from "@/components/deal-board";

const STAGE_OPTIONS = ["PROSPECT", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

const STAGE_STYLES: Record<string, string> = {
  PROSPECT: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  QUALIFIED: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  PROPOSAL: "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400",
  NEGOTIATION: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  WON: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  LOST: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  let deal: any;
  try {
    deal = await fetchWithAuth(`/deals/${params.id}`);
  } catch {
    notFound();
  }
  if (!deal) notFound();

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/pipeline" className="hover:text-gray-700 dark:hover:text-gray-200">Pipeline</Link>
        <span>/</span>
        <span className="text-gray-700 dark:text-gray-200">{deal.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{deal.title}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_STYLES[deal.stage]}`}>
              {deal.stage}
            </span>
            {deal.value && (
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                ${deal.value.toLocaleString()}
              </span>
            )}
            {deal.probability != null && (
              <span className="text-sm text-gray-500 dark:text-gray-400">{deal.probability}% probability</span>
            )}
          </div>
        </div>
        <DealBoard mode="edit" deal={deal} />
      </div>

      {/* Details card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Contact</p>
            <Link href={`/contacts/${deal.contact?.id}`} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
              {deal.contact?.businessName}
            </Link>
            {deal.contact?.phone && <p className="text-gray-500 dark:text-gray-400 text-xs">{deal.contact.phone}</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Assigned To</p>
            <p className="text-gray-700 dark:text-gray-300">
              {deal.assignedTo?.name || deal.assignedTo?.email || <span className="text-gray-300 dark:text-gray-600">Unassigned</span>}
            </p>
          </div>
          {deal.closeDate && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Close Date</p>
              <p className="text-gray-700 dark:text-gray-300">{format(new Date(deal.closeDate), "MMM d, yyyy")}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Created</p>
            <p className="text-gray-700 dark:text-gray-300">{format(new Date(deal.createdAt), "MMM d, yyyy")}</p>
          </div>
        </div>

        {deal.notes && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{deal.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
