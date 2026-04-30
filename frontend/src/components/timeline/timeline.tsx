"use client";

import { format } from "date-fns";
import {
  MdPhone,
  MdNoteAlt,
  MdCheckCircle,
  MdSwapHoriz,
  MdMail,
} from "react-icons/md";

export type TimelineEvent = {
  type: "CALL" | "NOTE" | "TASK_COMPLETED" | "DEAL_STAGE_CHANGE" | "EMAIL_SENT";
  at: string;
  sourceId: string;
  payload: Record<string, any>;
};

const ICONS = {
  CALL: { Icon: MdPhone, color: "text-blue-500" },
  NOTE: { Icon: MdNoteAlt, color: "text-gray-500" },
  TASK_COMPLETED: { Icon: MdCheckCircle, color: "text-green-500" },
  DEAL_STAGE_CHANGE: { Icon: MdSwapHoriz, color: "text-orange-500" },
  EMAIL_SENT: { Icon: MdMail, color: "text-purple-500" },
} as const;

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events?.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">No activity yet.</p>
    );
  }
  return (
    <ol className="relative space-y-4 border-l border-gray-200 pl-6 dark:border-gray-800">
      {events.map((e) => {
        const { Icon, color } = ICONS[e.type] ?? ICONS.NOTE;
        return (
          <li key={`${e.type}-${e.sourceId}`} className="relative">
            <span className="absolute -left-9 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white ring-2 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
              <Icon className={`h-3.5 w-3.5 ${color}`} />
            </span>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {e.type.replace("_", " ").toLowerCase()}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {format(new Date(e.at), "MMM d, yyyy h:mm a")}
                </p>
              </div>
              <TimelineBody event={e} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TimelineBody({ event }: { event: TimelineEvent }) {
  const p = event.payload || {};
  switch (event.type) {
    case "CALL":
      return (
        <p className="mt-1 text-gray-700 dark:text-gray-300">
          {p.summary || `${p.status} · ${p.duration || 0}s`}
        </p>
      );
    case "NOTE":
      return (
        <p className="mt-1 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
          {p.content}
        </p>
      );
    case "TASK_COMPLETED":
      return (
        <p className="mt-1 text-gray-700 dark:text-gray-300">{p.title}</p>
      );
    case "DEAL_STAGE_CHANGE":
      return (
        <p className="mt-1 text-gray-700 dark:text-gray-300">
          {p.fromStage ? `${p.fromStage} → ${p.toStage}` : `Created at ${p.toStage}`}
          {p.reason ? ` (${p.reason})` : ""}
        </p>
      );
    case "EMAIL_SENT":
      return (
        <p className="mt-1 text-gray-700 dark:text-gray-300">
          {p.subject} <span className="text-gray-400">· {p.status}</span>
        </p>
      );
    default:
      return null;
  }
}
