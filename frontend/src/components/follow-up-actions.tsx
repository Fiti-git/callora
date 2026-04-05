"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { runFollowUps } from "@/app/actions/campaign";

interface FollowUpActionsProps {
  campaignId: string;
  pendingCount: number;
}

export function FollowUpActions({ campaignId, pendingCount }: FollowUpActionsProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRun() {
    setLoading(true);
    try {
      const res = await runFollowUps(campaignId);
      toast.success(`Processed ${res.processed ?? 0} follow-up${res.processed !== 1 ? "s" : ""}.`);
      router.refresh();
    } catch (error: any) {
      toast.error("Failed: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRun}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
    >
      {loading ? (
        <>
          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Running...
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Run {pendingCount} Follow-Up{pendingCount !== 1 ? "s" : ""}
        </>
      )}
    </button>
  );
}
