"use client";

import { useState } from "react";
import { format } from "date-fns";
import { BulkActionToolbar } from "./bulk-action-toolbar";
import { bulkQualifyLeads, bulkDisqualifyLeads, bulkDeleteLeads } from "@/app/actions/leads";

const LEAD_STATUS_STYLES: Record<string, string> = {
  QUALIFIED: "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-500/20",
  CALLED: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-500/20",
  DISQUALIFIED: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-500/20",
  NEW: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-gray-600",
};

export function LeadsBulkList({ leads }: { leads: any[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allOnPage = leads.length > 0 && leads.every((l) => selected.has(l.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <>
      <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/50">
            <th className="px-4 py-3 w-8">
              <input
                type="checkbox"
                checked={allOnPage}
                onChange={() =>
                  setSelected((p) => (allOnPage ? new Set() : new Set(leads.map((l) => l.id))))
                }
                aria-label="Select all on this page"
              />
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Contact</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Campaign</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Score</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {leads.map((lead: any) => (
            <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
              <td className="px-4 py-4">
                <input
                  type="checkbox"
                  checked={selected.has(lead.id)}
                  onChange={() => toggle(lead.id)}
                  aria-label={`Select ${lead.businessName}`}
                />
              </td>
              <td className="px-6 py-4">
                <div className="text-sm font-medium text-gray-900 dark:text-white">{lead.businessName}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{lead.phone}</div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{lead.campaign?.name || "—"}</td>
              <td className="px-6 py-4">
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${LEAD_STATUS_STYLES[lead.status] || LEAD_STATUS_STYLES.NEW}`}>
                  {lead.status}
                </span>
              </td>
              <td className="px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                {lead.interestScore > 0 ? `${lead.interestScore}/10` : "—"}
              </td>
              <td className="px-6 py-4 text-sm text-gray-400 dark:text-gray-500">
                {lead.createdAt ? format(new Date(lead.createdAt), "MMM d, yyyy") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <BulkActionToolbar
        selectedIds={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        actions={[
          { label: "Qualify", action: async (ids) => { await bulkQualifyLeads(ids); } },
          { label: "Disqualify", action: async (ids) => { await bulkDisqualifyLeads(ids); } },
          { label: "Delete", variant: "danger", action: async (ids) => { await bulkDeleteLeads(ids); } },
        ]}
      />
    </>
  );
}
