"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { createTask, completeTask, deleteTask } from "@/app/actions/tasks";

interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  completed: boolean;
  assignedTo?: { id: string; name?: string; email: string };
}

interface TaskWidgetProps {
  tasks: Task[];
  contactId: string;
}

const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function TaskWidget({ tasks, contactId }: TaskWidgetProps) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      await createTask({
        title,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        contactId,
      });
      setTitle("");
      setDueDate("");
      setShowForm(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(taskId: string) {
    await completeTask(taskId);
    router.refresh();
  }

  async function handleDelete(taskId: string) {
    await deleteTask(taskId);
    router.refresh();
  }

  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <div className="space-y-3">
      {/* Open tasks */}
      {open.map((task) => (
        <div key={task.id} className="flex items-start gap-2 group">
          <button
            onClick={() => handleToggle(task.id)}
            className="w-4 h-4 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0 mt-0.5 hover:border-blue-500 transition-colors"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 dark:text-gray-200">{task.title}</p>
            {task.dueDate && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Due {format(new Date(task.dueDate), "MMM d")}
              </p>
            )}
          </div>
          <button
            onClick={() => handleDelete(task.id)}
            className="text-xs text-gray-200 dark:text-gray-700 hover:text-red-400 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ×
          </button>
        </div>
      ))}

      {/* Completed tasks (collapsed) */}
      {done.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{done.length} completed task{done.length !== 1 ? "s" : ""}</p>
      )}

      {/* Empty */}
      {tasks.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 dark:text-gray-500">No tasks yet.</p>
      )}

      {/* Add task form */}
      {showForm ? (
        <form onSubmit={handleCreate} className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            autoFocus
            className={inputCls}
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputCls}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
        >
          + Add task
        </button>
      )}
    </div>
  );
}
