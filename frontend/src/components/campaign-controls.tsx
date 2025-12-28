"use client";

import { findLeads, startCalls } from "@/app/actions/campaign";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type CampaignStatus =
  | "DRAFT"
  | "SCRAPING"
  | "READY"
  | "CALLING"
  | "COMPLETED"
  | "FAILED"
  | "RUNNING";

interface CampaignControlsProps {
  campaignId: string;
  status: string;
  leadsCount: number;
}

export function CampaignControls({
  campaignId,
  status,
  leadsCount,
}: CampaignControlsProps) {
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(20);
  const router = useRouter();

  async function handleFindLeads() {
    setLoading(true);
    try {
      const res = await findLeads(campaignId, limit);
      toast.success(`Found ${res.count || 0} leads!`);
      router.refresh();
    } catch (error: any) {
      toast.error("Scraping Failed: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartCalls() {
    if (!confirm(`Are you sure you want to call ${leadsCount} leads?`)) return;

    setLoading(true);
    try {
      await startCalls(campaignId);
      toast.success("Calls initiated!");
      router.refresh();
    } catch (error: any) {
      toast.error("Calling Failed: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const isScraping = status === "SCRAPING";
  const isCalling = status === "CALLING";
  const isRunning = status === "RUNNING"; // Handling legacy status just in case

  if (isScraping) {
    return (
      <div className="text-sm text-indigo-600 font-medium animate-pulse">
        Finding Leads...
      </div>
    );
  }

  if (isCalling || isRunning) {
    return (
      <div className="text-sm text-green-600 font-medium animate-pulse">
        Calling Leads...
      </div>
    );
  }

  const showFindLeads =
    status === "DRAFT" ||
    status === "READY" ||
    status === "FAILED" ||
    status === "COMPLETED";

  return (
    <div className="flex gap-2 items-center">
      {/* Show Find Leads if Draft, Ready (to add more?), or Failed */}
      {showFindLeads && (
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md overflow-hidden bg-white">
            <span className="bg-gray-100 px-2 py-2 text-xs text-gray-500 border-r">
              Limit
            </span>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-16 px-2 py-1 text-sm outline-none"
              min={1}
              max={100}
            />
          </div>
          <button
            onClick={handleFindLeads}
            disabled={loading}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm"
          >
            {loading
              ? "Working..."
              : leadsCount > 0
              ? "Find More Leads"
              : "Find Leads"}
          </button>
        </div>
      )}

      {/* Show Call Leads only if we have leads */}
      {leadsCount > 0 &&
        (status === "READY" ||
          status === "DRAFT" ||
          status === "FAILED" ||
          status === "COMPLETED") && (
          <button
            onClick={handleStartCalls}
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            {loading ? "Starting..." : "Start Calls"}
          </button>
        )}
    </div>
  );
}
