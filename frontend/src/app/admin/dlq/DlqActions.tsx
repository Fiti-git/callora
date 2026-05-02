"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { platformPost } from "../actions/platformProxy";

export default function DlqActions({
  queue,
  jobId,
}: {
  queue: string;
  jobId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function call(action: "retry" | "discard") {
    if (action === "discard" && !confirm(`Discard job ${jobId}?`)) return;
    setBusy(true);
    const r = await platformPost(`/dlq/${queue}/${jobId}/${action}`);
    setBusy(false);
    if (!r.ok) alert(r.error);
    else router.refresh();
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
