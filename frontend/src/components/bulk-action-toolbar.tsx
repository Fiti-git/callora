"use client";

import { useState, useTransition } from "react";

export type BulkAction = {
  label: string;
  action: (ids: string[]) => Promise<void>;
  variant?: "default" | "danger";
};

/**
 * Sticky bottom-of-page toolbar that appears when ≥1 row is selected.
 *
 * Reuses the existing Tailwind palette — no new UI lib. Disables itself
 * during an in-flight action and surfaces inline errors via `setError`.
 */
export function BulkActionToolbar({
  selectedIds,
  actions,
  onClear,
}: {
  selectedIds: string[];
  actions: BulkAction[];
  onClear?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (selectedIds.length === 0) return null;

  const run = (a: BulkAction) => {
    setError(null);
    startTransition(async () => {
      try {
        await a.action(selectedIds);
        onClear?.();
      } catch (e: any) {
        setError(e?.message || "Action failed");
      }
    });
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 flex flex-col items-center gap-2">
      {error ? (
        <div className="rounded-md bg-red-50 px-3 py-1 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      ) : null}
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-lg dark:border-gray-800 dark:bg-gray-900">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {selectedIds.length} selected
        </span>
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={pending}
            onClick={() => run(a)}
            className={
              a.variant === "danger"
                ? "rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                : "rounded-md bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20"
            }
          >
            {a.label}
          </button>
        ))}
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
