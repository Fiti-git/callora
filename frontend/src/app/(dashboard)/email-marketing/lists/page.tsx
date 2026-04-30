import Link from "next/link";
import { format } from "date-fns";
import { listLists } from "@/app/actions/email-marketing";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  let items: any[] = [];
  try {
    const res = await listLists({ limit: 200 });
    items = res.items ?? [];
  } catch (err) {
    console.error("Lists page:", err);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Recipient Lists</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage the lists you send campaigns to.
          </p>
        </div>
        <Link
          href="/email-marketing/lists/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New List
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No lists yet. Create your first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((l) => (
            <Link
              key={l.id}
              href={`/email-marketing/lists/${l.id}`}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 hover:shadow-sm hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
            >
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{l.name}</h3>
              {l.description && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {l.description}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{(l.memberCount ?? 0).toLocaleString()} members</span>
                <span>{format(new Date(l.createdAt), "MMM d, yyyy")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
