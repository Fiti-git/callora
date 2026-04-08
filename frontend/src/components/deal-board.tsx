"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { createDeal, updateDeal, deleteDeal } from "@/app/actions/deals";
import { getContacts } from "@/app/actions/contacts";

const STAGES = ["PROSPECT", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;

const STAGE_STYLES: Record<string, string> = {
  PROSPECT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  QUALIFIED: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  PROPOSAL: "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400",
  NEGOTIATION: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  WON: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  LOST: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

type Props =
  | { mode: "create-button" }
  | { mode: "card"; deal: any }
  | { mode: "edit"; deal: any };

export function DealBoard(props: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [stageChanging, setStageChanging] = useState(false);

  async function loadContacts() {
    try {
      const data = await getContacts();
      setContacts(data);
    } catch {}
  }

  if (props.mode === "card") {
    const { deal } = props;
    return (
      <Link
        href={`/pipeline/${deal.id}`}
        className="block p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all"
      >
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{deal.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{deal.contact?.businessName}</p>
        {deal.value && (
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1">${deal.value.toLocaleString()}</p>
        )}
        {deal.closeDate && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Close {format(new Date(deal.closeDate), "MMM d")}
          </p>
        )}
      </Link>
    );
  }

  if (props.mode === "edit") {
    const { deal } = props;
    return (
      <>
        <div className="flex gap-2">
          {/* Quick stage change */}
          <select
            value={deal.stage}
            disabled={stageChanging}
            onChange={async (e) => {
              setStageChanging(true);
              await updateDeal(deal.id, { stage: e.target.value });
              router.refresh();
              setStageChanging(false);
            }}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!confirm("Delete this deal?")) return;
              await deleteDeal(deal.id);
              router.push("/pipeline");
              router.refresh();
            }}
            className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            Delete
          </button>
        </div>
      </>
    );
  }

  // create-button mode
  return (
    <>
      <button
        onClick={() => { setShowForm(true); loadContacts(); }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New Deal
      </button>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">New Deal</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setLoading(true);
                try {
                  const deal = await createDeal({
                    title: fd.get("title") as string,
                    contactId: fd.get("contactId") as string,
                    value: fd.get("value") ? Number(fd.get("value")) : undefined,
                    probability: fd.get("probability") ? Number(fd.get("probability")) : undefined,
                    stage: (fd.get("stage") as string) || "PROSPECT",
                    closeDate: fd.get("closeDate")
                      ? new Date(fd.get("closeDate") as string).toISOString()
                      : undefined,
                    notes: fd.get("notes") as string || undefined,
                  });
                  setShowForm(false);
                  router.refresh();
                  router.push(`/pipeline/${deal.id}`);
                } catch (err: unknown) {
                  alert(err instanceof Error ? err.message : "Failed to create deal");
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Deal Title *</label>
                <input name="title" required autoFocus className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact *</label>
                <select name="contactId" required className={inputCls}>
                  <option value="">Select a contact…</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.businessName} ({c.phone})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Value ($)</label>
                  <input name="value" type="number" min="0" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stage</label>
                  <select name="stage" defaultValue="PROSPECT" className={inputCls}>
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Close Date</label>
                <input name="closeDate" type="date" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea name="notes" rows={2} className={`${inputCls} resize-none`} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Creating…" : "Create Deal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
