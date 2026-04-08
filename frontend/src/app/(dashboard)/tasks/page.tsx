import { fetchWithAuth } from "@/lib/api";
import { format } from "date-fns";
import Link from "next/link";
import { TaskActions } from "@/components/task-actions";

export default async function TasksPage() {
  let tasks: any[] = [];
  try {
    tasks = await fetchWithAuth("/tasks");
  } catch {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        Failed to load tasks. Please refresh the page.
      </div>
    );
  }

  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Tasks</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {open.length} open · {done.length} completed
          </p>
        </div>
        <TaskActions mode="create" />
      </div>

      {/* Open tasks */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Open</h2>
        </div>
        {open.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">No open tasks. Great job!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {open.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      {/* Completed tasks */}
      {done.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Completed</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {done.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: any }) {
  const isOverdue = task.dueDate && !task.completed && new Date(task.dueDate) < new Date();

  return (
    <div className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
      <TaskActions mode="toggle" taskId={task.id} completed={task.completed} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${task.completed ? "line-through text-gray-400 dark:text-gray-600" : "text-gray-900 dark:text-white"}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {task.dueDate && (
            <span className={`text-xs ${isOverdue ? "text-red-500 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
              {isOverdue ? "Overdue · " : "Due "}
              {format(new Date(task.dueDate), "MMM d, yyyy")}
            </span>
          )}
          {task.assignedTo && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              → {task.assignedTo.name || task.assignedTo.email}
            </span>
          )}
          {task.contact && (
            <Link
              href={`/contacts/${task.contact.id}`}
              className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {task.contact.businessName}
            </Link>
          )}
        </div>
        {task.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{task.description}</p>
        )}
      </div>
      <TaskActions mode="delete" taskId={task.id} />
    </div>
  );
}
