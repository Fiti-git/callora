"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { activateAutomation } from "@/app/actions/email-marketing";

interface Automation {
  id: string;
  name: string;
  trigger: string;
  active: boolean;
  sequence: any[];
}

export function AutomationsList({ initial }: { initial: Automation[] }) {
  const [items, setItems] = useState(initial);
  const { showToast } = useToast();

  async function onToggle(id: string, active: boolean) {
    try {
      await activateAutomation(id, active);
      setItems((prev) => prev.map((a) => (a.id === id ? { ...a, active } : a)));
      showToast("success", active ? "Activated" : "Deactivated");
    } catch (err: any) {
      showToast("error", err?.message || "Failed");
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
        No automations yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((a) => (
        <div
          key={a.id}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {a.name}
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Trigger: {a.trigger}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {Array.isArray(a.sequence) ? a.sequence.length : 0} step
                {Array.isArray(a.sequence) && a.sequence.length === 1 ? "" : "s"}
              </p>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={a.active}
                onChange={(e) => onToggle(a.id, e.target.checked)}
              />
              <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-blue-600 relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition peer-checked:after:translate-x-4" />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
