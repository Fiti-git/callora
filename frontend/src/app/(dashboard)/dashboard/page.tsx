import Link from "next/link";
import { fetchWithAuth } from "@/lib/api";
import Widget from "@/horizon-ui/components/widget/Widget";
import Card from "@/horizon-ui/components/card";
import {
  MdCampaign,
  MdPeople,
  MdPhone,
  MdVerified,
  MdAdd,
  MdBarChart,
} from "react-icons/md";

function timeAgo(date: string | Date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const ACTIVITY_COLOR: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-600",
  NO_ANSWER: "bg-yellow-100 text-yellow-600",
  VOICEMAIL: "bg-blue-100 text-blue-600",
  FAILED: "bg-red-100 text-red-600",
  RUNNING: "bg-blue-100 text-blue-600",
  DRAFT: "bg-gray-100 text-gray-600",
};

export default async function DashboardPage() {
  let stats: any = null;
  let activity: any[] = [];

  try {
    [stats, activity] = await Promise.all([
      fetchWithAuth("/stats"),
      fetchWithAuth("/stats/activity").catch(() => []),
    ]);
  } catch (error) {
    console.error("Dashboard Fetch Error:", error);
    return (
      <div className="p-6">
        <Card extra="p-5">
          <p className="text-red-500">
            Failed to load dashboard data. Please refresh the page.
          </p>
        </Card>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div>
      <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        <Widget
          icon={<MdCampaign className="h-7 w-7" />}
          title="Campaigns"
          subtitle={String(stats.campaignCount || 0)}
        />
        <Widget
          icon={<MdPeople className="h-6 w-6" />}
          title="Total Leads"
          subtitle={String(stats.leadCount || 0)}
        />
        <Widget
          icon={<MdPhone className="h-7 w-7" />}
          title="Calls Made"
          subtitle={String(stats.callCount || 0)}
        />
        <Widget
          icon={<MdVerified className="h-6 w-6" />}
          title="Qualified"
          subtitle={String(stats.qualifiedCount || 0)}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
        <Link
          href="/campaigns/new"
          className="flex items-center gap-3 rounded-[20px] bg-gradient-to-r from-brandLinear to-brand-500 px-5 py-4 text-white shadow-3xl shadow-shadow-500 transition-all hover:from-brand-500 hover:to-brand-600 dark:shadow-none"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <MdAdd className="h-5 w-5" />
          </div>
          <span className="font-bold">New Campaign</span>
        </Link>
        <Link
          href="/demo"
          className="flex items-center gap-3 rounded-[20px] bg-white px-5 py-4 shadow-3xl shadow-shadow-500 transition-all hover:bg-lightPrimary dark:!bg-navy-800 dark:shadow-none"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700 dark:text-white">
            <MdPhone className="h-5 w-5" />
          </div>
          <span className="font-bold text-navy-700 dark:text-white">
            Try Demo Call
          </span>
        </Link>
        <Link
          href="/analytics"
          className="flex items-center gap-3 rounded-[20px] bg-white px-5 py-4 shadow-3xl shadow-shadow-500 transition-all hover:bg-lightPrimary dark:!bg-navy-800 dark:shadow-none"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700 dark:text-white">
            <MdBarChart className="h-5 w-5" />
          </div>
          <span className="font-bold text-navy-700 dark:text-white">
            View Analytics
          </span>
        </Link>
      </div>

      <div className="mt-5">
        <Card extra="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-navy-700 dark:text-white">
              Recent Activity
            </h3>
            <Link
              href="/analytics"
              className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              View all
            </Link>
          </div>

          {activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary dark:bg-navy-700">
                <MdCampaign className="h-6 w-6 text-gray-600 dark:text-white" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                No activity yet
              </p>
              <p className="mb-4 mt-1 text-xs text-gray-600">
                Run your first campaign to see activity here.
              </p>
              <Link
                href="/campaigns/new"
                className="text-sm font-bold text-brand-500 hover:text-brand-600 dark:text-brand-400"
              >
                Create a campaign →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-white/10">
              {activity.map((event: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-3 transition-colors"
                >
                  <div
                    className={
                      "flex h-10 w-10 items-center justify-center rounded-full " +
                      (ACTIVITY_COLOR[event.status] ||
                        "bg-gray-100 text-gray-600")
                    }
                  >
                    {event.type === "campaign" ? (
                      <MdCampaign className="h-5 w-5" />
                    ) : (
                      <MdPhone className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-navy-700 dark:text-white">
                      {event.title}
                    </p>
                    {event.subtitle ? (
                      <p className="truncate text-xs text-gray-600">
                        {event.subtitle}
                      </p>
                    ) : null}
                  </div>
                  <span className="flex-shrink-0 text-xs text-gray-600">
                    {timeAgo(event.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
