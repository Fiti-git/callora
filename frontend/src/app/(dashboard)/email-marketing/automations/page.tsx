import Link from "next/link";
import { listAutomations } from "@/app/actions/email-marketing";
import { AutomationsList } from "./list";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  let items: any[] = [];
  try {
    const res = await listAutomations();
    items = res.items ?? [];
  } catch (err) {
    console.error("Automations:", err);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Automations</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Drip sequences triggered by CRM events.
          </p>
        </div>
        <Link
          href="/email-marketing/automations/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Automation
        </Link>
      </div>

      <AutomationsList initial={items} />
    </div>
  );
}
