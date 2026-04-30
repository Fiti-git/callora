"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function DlqActions({
  queue,
  jobId,
}: {
  queue: string;
  jobId: string;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const token = (session as any)?.accessToken as string | undefined;
  const base =
    process.env.NEXT_PUBLIC_PLATFORM_API_URL ||
    "http://localhost:4000/api/platform";

  async function call(action: "retry" | "discard") {
    if (action === "discard" && !confirm(`Discard job ${jobId}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/dlq/${queue}/${jobId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-1">
      <button
        onClick={() => call("retry")}
        disabled={busy}
        className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
      >
        Retry
      </button>
      <button
        onClick={() => call("discard")}
        disabled={busy}
        className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50"
      >
        Discard
      </button>
    </div>
  );
}
