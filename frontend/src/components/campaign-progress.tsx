"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getCampaignProgress } from "@/app/actions/campaign";
import { useCampaignProgress } from "@/hooks/useCampaignProgress";

interface CampaignProgressProps {
  campaignId: string;
  initialStatus: string;
}

const TERMINAL_STATUSES = ["COMPLETED", "PAUSED_QUOTA", "CANCELLED", "FAILED"];

export function CampaignProgress({ campaignId, initialStatus }: CampaignProgressProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0,
  });

  // SSE: pulls real-time events as the campaign worker fires. Falls back to
  // polling automatically when EventSource is unsupported or the connection
  // is closed (see hook).
  const accessToken = (session as any)?.user?.accessToken as string | undefined;
  const live = useCampaignProgress(campaignId, accessToken);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  // Apply live snapshot/event updates from SSE.
  useEffect(() => {
    if (!live) return;
    if (typeof live.completed === "number" && typeof live.total === "number") {
      setProgress({ completed: live.completed, total: live.total });
    } else if (typeof live.leadsTotal === "number") {
      setProgress({
        completed: live.leadsProcessed ?? 0,
        total: live.leadsTotal ?? 0,
      });
    }
    if (typeof live.status === "string") {
      setStatus(live.status);
      if (TERMINAL_STATUSES.includes(live.status)) router.refresh();
    }
  }, [live, router]);

  // Fallback poller — runs every 10s while SSE is unavailable or as a
  // safety net. The cost is negligible compared to the previous 5s interval.
  useEffect(() => {
    if (status !== "RUNNING" && status !== "CALLING") return;
    let cancelled = false;
    async function poll() {
      try {
        const data = await getCampaignProgress(campaignId);
        if (cancelled) return;
        if (data?.progress) setProgress(data.progress);
        if (data?.status) {
          setStatus(data.status);
          if (TERMINAL_STATUSES.includes(data.status)) router.refresh();
        }
      } catch {
        // non-fatal
      }
    }
    poll();
    const id = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [campaignId, status, router]);

  if (status !== "RUNNING" && status !== "CALLING") return null;

  const { completed, total } = progress;
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Calling leads…
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {completed} / {total} calls completed
        </p>
      </div>
      <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
