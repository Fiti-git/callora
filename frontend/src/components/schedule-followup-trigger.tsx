"use client";

import { useState } from "react";
import { ScheduleFollowUpModal } from "./schedule-followup-modal";

interface Lead {
  id: string;
  businessName: string;
  phone: string | null;
  status: string;
  campaign?: { name: string };
}

export function ScheduleFollowUpTrigger({ leads }: { leads: Lead[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Schedule Follow-Up
      </button>

      <ScheduleFollowUpModal
        isOpen={open}
        onClose={() => setOpen(false)}
        leads={leads}
      />
    </>
  );
}
