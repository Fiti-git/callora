"use client";

import Link from "next/link";
import { useState } from "react";
import { BulkActionToolbar } from "./bulk-action-toolbar";
import { bulkDealStatus } from "@/app/actions/deals";

const STAGES = ["PROSPECT", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;

/**
 * Tabular list of deals with bulk-select. Rendered below the kanban board on
 * the pipeline page so power users can move many deals at once without
 * dragging cards individually.
 */
export function DealsBulkList({ deals }: { deals: any[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stageTarget, setStageTarget] = useState<(typeof STAGES)[number]>("QUALIFIED");
  const allOnPage = deals.length > 0 && deals.every((d) => selected.has(d.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50">
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={() =>
                    setSelected(allOnPage ? new Set() : new Set(deals.map((d) => d.id)))
                  }
                  aria-label="Select all on this page"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {deals.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                  />
                </td>
                <td className="px-6 py-3 text-sm">
                  <Link href={`/pipeline/${d.id}`} className="font-medium text-gray-900 dark:text-white hover:text-brand-500">
                    {d.title}
                  </Link>
                </td>
                <td className="px-6 py-3 text-xs text-gray-600 dark:text-gray-400">{d.stage}</td>
                <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {d.value ? `$${Number(d.value).toLocaleString()}` : "—"}
                </td>
                <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                  {d.contact?.businessName || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected.size > 0 ? (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-gray-600">
          <label>Bulk move to:</label>
          <select
            value={stageTarget}
            onChange={(e) => setStageTarget(e.target.value as any)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      ) : null}

      <BulkActionToolbar
        selectedIds={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        actions={[
          {
            label: `Move to ${stageTarget}`,
            action: async (ids) => { await bulkDealStatus(ids, stageTarget); },
          },
        ]}
      />
    </>
  );
}
