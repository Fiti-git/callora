"use client";

import { runCampaign } from "@/app/actions/campaign";
import { useState } from "react";
import { useRouter } from "next/navigation";

import toast from "react-hot-toast";

export function RunCampaignButton({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRun() {
    if (!confirm("This will trigger real calls if configured. Are you sure?"))
      return;

    setLoading(true);
    try {
      await runCampaign(campaignId);
      router.refresh();
      toast.success("Campaign finished successfully!");
    } catch (error: any) {
      toast.error("Campaign Failed: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRun}
      disabled={loading}
      className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
    >
      {loading ? "Running Agent..." : "Run Campaign"}
    </button>
  );
}
