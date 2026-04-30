"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

/**
 * Minimal date-range picker. Supports presets (7d / 30d / 90d) and a free-form
 * <input type="date"> pair. Updates `from`/`to` query params on the page; the
 * Server Component reads them on the next render and refetches via the
 * Server Action.
 */
export function DateRangePicker() {
  const router = useRouter();
  const params = useSearchParams();
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  useEffect(() => {
    setFrom(params.get("from") ?? "");
    setTo(params.get("to") ?? "");
  }, [params]);

  function applyPreset(days: number) {
    const now = new Date();
    const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const qs = new URLSearchParams(params.toString());
    qs.set("from", past.toISOString());
    qs.set("to", now.toISOString());
    router.push(`?${qs.toString()}`);
  }

  function applyCustom() {
    const qs = new URLSearchParams(params.toString());
    if (from) qs.set("from", new Date(from).toISOString());
    else qs.delete("from");
    if (to) qs.set("to", new Date(to).toISOString());
    else qs.delete("to");
    router.push(`?${qs.toString()}`);
  }

  function clear() {
    router.push("?");
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex gap-1">
        <button
          onClick={() => applyPreset(7)}
          className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          7d
        </button>
        <button
          onClick={() => applyPreset(30)}
          className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          30d
        </button>
        <button
          onClick={() => applyPreset(90)}
          className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          90d
        </button>
      </div>
      <label className="text-xs text-gray-500 dark:text-gray-400">
        From
        <input
          type="date"
          value={from ? from.slice(0, 10) : ""}
          onChange={(e) => setFrom(e.target.value)}
          className="block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs text-gray-500 dark:text-gray-400">
        To
        <input
          type="date"
          value={to ? to.slice(0, 10) : ""}
          onChange={(e) => setTo(e.target.value)}
          className="block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm"
        />
      </label>
      <button
        onClick={applyCustom}
        className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white"
      >
        Apply
      </button>
      <button
        onClick={clear}
        className="px-2 py-1 text-xs rounded text-gray-500 hover:text-gray-700"
      >
        Clear
      </button>
    </div>
  );
}
