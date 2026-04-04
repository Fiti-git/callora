"use client";

import { findLeads, startCalls, runFollowUps } from "@/app/actions/campaign";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ConfirmationModal } from "./confirmation-modal";

interface CampaignControlsProps {
  campaignId: string;
  status: string;
  leadsCount: number;
  campaignType?: string;
  pendingFollowUps?: number;
}

export function CampaignControls({
  campaignId,
  status,
  leadsCount,
  campaignType = "AI",
  pendingFollowUps = 0,
}: CampaignControlsProps) {
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(20);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const router = useRouter();

  async function handleFindLeads() {
    setLoading(true);
    try {
      const res = await findLeads(campaignId, limit);
      toast.success(`Found ${res.count || 0} leads.`);
      router.refresh();
    } catch (error: any) {
      toast.error("Failed to find leads: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function executeStartCalls() {
    setLoading(true);
    try {
      await startCalls(campaignId);
      toast.success("Calls initiated.");
      setIsConfirmOpen(false);
      router.refresh();
    } catch (error: any) {
      toast.error("Failed to start calls: " + error.message);
      setIsConfirmOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunFollowUps() {
    setLoading(true);
    try {
      const res = await runFollowUps(campaignId);
      toast.success(`Processed ${res.processed ?? 0} follow-up${res.processed !== 1 ? "s" : ""}.`);
      router.refresh();
    } catch (error: any) {
      toast.error("Follow-ups failed: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const isScraping = status === "SCRAPING";
  const isCalling = status === "CALLING" || status === "RUNNING";

  if (isScraping) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-blue-600 font-medium">
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Finding leads...
      </div>
    );
  }

  if (isCalling) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-green-600 font-medium">
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Calling leads...
      </div>
    );
  }

  const canAction =
    status === "DRAFT" ||
    status === "READY" ||
    status === "FAILED" ||
    status === "COMPLETED";

  return (
    <>
      <ConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={executeStartCalls}
        title="Start Calls"
        message={`This will initiate calls to ${leadsCount} lead${leadsCount !== 1 ? "s" : ""}. Proceed?`}
        confirmText="Start Calls"
        isLoading={loading}
      />

      <div className="flex items-center gap-2">
        {/* AI only: Find Leads */}
        {campaignType === "AI" && canAction && (
          <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden bg-white">
            <span className="px-2.5 py-2 text-xs text-gray-500 bg-gray-50 border-r border-gray-300">
              Limit
            </span>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-14 px-2 py-2 text-sm text-gray-900 focus:outline-none"
              min={1}
              max={100}
            />
          </div>
        )}

        {campaignType === "AI" && canAction && (
          <button
            onClick={handleFindLeads}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {loading ? "Searching..." : leadsCount > 0 ? "Find More Leads" : "Find Leads"}
          </button>
        )}

        {/* Start Calls — visible when leads exist */}
        {leadsCount > 0 && canAction && (
          <button
            onClick={() => setIsConfirmOpen(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Start Calls
          </button>
        )}

        {/* Run Follow-Ups — visible when leads are due for retry or callback */}
        {pendingFollowUps > 0 && canAction && (
          <button
            onClick={handleRunFollowUps}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run Follow-Ups ({pendingFollowUps})
          </button>
        )}
      </div>
    </>
  );
}
