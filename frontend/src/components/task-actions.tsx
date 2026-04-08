"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTask, completeTask, deleteTask } from "@/app/actions/tasks";

// Polymorphic component covering create, toggle, and delete modes
type Props =
  | { mode: "create" }
  | { mode: "toggle"; taskId: string; completed: boolean }
  | { mode: "delete"; taskId: string };

const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function TaskActions(props: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  if (props.mode === "toggle") {
    return (
      <button
        onClick={async () => {
          setLoading(true);
          await completeTask(props.taskId);
          router.refresh();
          setLoading(false);
        }}
        disabled={loading}
        className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 transition-colors ${
          props.completed
            ? "border-green-500 bg-green-500"
            : "border-gray-300 dark:border-gray-600 hover:border-blue-500"
        } disabled:opacity-50`}
      >
        {props.completed && (
          <svg className="w-full h-full text-white p-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    );
  }

  if (props.mode === "delete") {
    return (
      <button
        onClick={async () => {
          if (!confirm("Delete this task?")) return;
          await deleteTask(props.taskId);
          router.refresh();
        }}
        className="text-gray-300 dark:text-gray-700 hover:text-red-400 dark:hover:text-red-400 transition-colors text-lg leading-none flex-shrink-0"
      >
        ×
      </button>
    );
  }

  // Create mode
  return (
    <>
      <button
        onClick={() => setShowForm(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Task
      </button>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">New Task</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setLoading(true);
                try {
                  await createTask({
                    title: fd.get("title") as string,
                    description: fd.get("description") as string || undefined,
                    dueDate: fd.get("dueDate")
                      ? new Date(fd.get("dueDate") as string).toISOString()
                      : undefined,
                  });
                  setShowForm(false);
                  router.refresh();
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
                <input name="title" required autoFocus className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea name="description" rows={2} className={`${inputCls} resize-none`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                <input name="dueDate" type="date" className={inputCls} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
