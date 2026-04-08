"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import toast from "react-hot-toast";

export function CampaignRefresher({ status, prevStatus }: { status: string; prevStatus?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "RUNNING" && status !== "SCRAPING" && status !== "CALLING") return;

    const interval = setInterval(() => {
      router.refresh();
    }, 8000);

    return () => clearInterval(interval);
  }, [status, router]);

  // Show a toast when campaign completes (status transitions from running to done)
  useEffect(() => {
    if (status === "COMPLETED") {
      toast.success("Campaign complete!");
    }
  }, [status]);

  if (status === "RUNNING" || status === "SCRAPING" || status === "CALLING") {
    return (
      <div className="flex items-center gap-2 text-blue-400 text-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        Live — refreshing every 8s
      </div>
    );
  }

  return null;
}
