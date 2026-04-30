export function formatPct(rate: number | null | undefined): string {
  if (rate == null || isNaN(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
  SCHEDULED: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400",
  SENDING: "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-400",
  SENT: "bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-400",
  PAUSED: "bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-400",
  FAILED: "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-400",
};

export function statusBadge(status: string) {
  return STATUS_STYLES[status] || STATUS_STYLES.DRAFT;
}
