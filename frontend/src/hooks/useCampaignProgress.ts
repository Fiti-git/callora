"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Subscribes to the SSE endpoint at
 *   GET /api/campaigns/:id/progress/stream?token=<jwt>
 * and returns the most-recent payload the server emitted.
 *
 * Token is passed via query param because EventSource cannot set headers in
 * the browser. The route enforces tenant-org scoping server-side.
 *
 * The hook is a no-op when EventSource is unavailable (older browsers) or
 * the access token isn't ready yet — the caller's polling fallback covers
 * those cases.
 */
export interface CampaignProgressPayload {
  event?: string;
  status?: string;
  leadsTotal?: number;
  leadsProcessed?: number;
  callsCompleted?: number;
  callsFailed?: number;
  qualified?: number;
  disqualified?: number;
  completed?: number;
  total?: number;
  leadId?: string;
  qualifiedFlag?: boolean;
  ts?: number;
}

export function useCampaignProgress(
  campaignId: string,
  accessToken: string | undefined
): CampaignProgressPayload | null {
  const [payload, setPayload] = useState<CampaignProgressPayload | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof EventSource === "undefined") return;
    if (!accessToken || !campaignId) return;

    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const url = `${apiBase}/api/campaigns/${campaignId}/progress/stream?token=${encodeURIComponent(
      accessToken
    )}`;
    const es = new EventSource(url);
    esRef.current = es;

    function handle(evt: MessageEvent) {
      try {
        const data = JSON.parse(evt.data);
        setPayload({ ...data, event: (evt as any).type });
      } catch {
        // ignore
      }
    }

    es.addEventListener("snapshot", handle as any);
    es.addEventListener("lead-dispatched", handle as any);
    es.addEventListener("call-completed", handle as any);
    es.addEventListener("progress", handle as any);
    es.onerror = () => {
      // Browser will auto-retry; close on permanent failure to free the slot.
      // Polling fallback keeps the UI responsive in the meantime.
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [campaignId, accessToken]);

  return payload;
}
