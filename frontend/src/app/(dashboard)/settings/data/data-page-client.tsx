"use client";

import { useState } from "react";
import { exportMyData, deleteMyOrganization } from "@/app/actions/gdpr";

export default function DataPageClient({ orgName }: { orgName: string }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  // The modal's "I understand, delete" button only enables when the user
  // types the org name exactly. This is purely a UX guard — the backend
  // ALSO requires `confirmation: "DELETE_MY_ORG"` in the request body.
  const canSubmitDelete =
    !!orgName && typedName.trim() === orgName.trim() && !deleting;

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      const r = await exportMyData();
      if (!r.success || !r.bundle) {
        setExportError(r.error ?? "Export failed");
        return;
      }
      // Trigger a browser download of the JSON bundle.
      const blob = new Blob([JSON.stringify(r.bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `callora-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function onDelete() {
    if (!canSubmitDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await deleteMyOrganization({
        typedOrgName: typedName.trim(),
        expectedOrgName: orgName.trim(),
        reason: reason.trim() || undefined,
      });
      if (!r.success) {
        setDeleteError(r.error ?? "Delete failed");
        return;
      }
      setDeleted(true);
      // Force a sign-out by reloading; the JWT was revoked server-side
      // (tokenVersion bumped) so the next request would 401 anyway.
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch (err: any) {
      setDeleteError(err?.message ?? "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Export */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-navy-700 dark:bg-navy-800">
        <h2 className="text-lg font-semibold text-navy-700 dark:text-white">
          Export my data
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Download a JSON copy of every record we hold for your organisation:
          campaigns, leads, contacts, deals, calls, emails, billing history.
          Call transcripts longer than 5,000 characters are truncated.
        </p>
        <button
          onClick={onExport}
          disabled={exporting}
          className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {exporting ? "Preparing export…" : "Export my data"}
        </button>
        {exportError && (
          <p className="mt-3 text-sm text-red-600">{exportError}</p>
        )}
      </div>

      {/* Delete */}
      <div className="rounded-xl border border-red-300 bg-white p-6 dark:border-red-700 dark:bg-navy-800">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">
          Delete my organisation
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          This anonymises all personal data, cancels your Stripe subscription,
          and signs every user out. Audit logs and call records are retained in
          redacted form. <strong>This cannot be undone.</strong>
        </p>
        <button
          onClick={() => setConfirmOpen(true)}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
        >
          Delete my organisation
        </button>
      </div>

      {/* Confirmation modal */}
      {confirmOpen && !deleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-navy-800">
            <h3 className="text-lg font-semibold text-red-700">
              Confirm permanent deletion
            </h3>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              Type your organisation name{" "}
              <code className="font-mono text-red-700">{orgName || "(unknown)"}</code>{" "}
              to confirm. This action is irreversible.
            </p>
            <input
              type="text"
              autoFocus
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Organisation name"
              className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-900"
            />
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="(optional) Reason — kept in our audit log"
              rows={3}
              className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-navy-600 dark:bg-navy-900"
            />
            {deleteError && (
              <p className="mt-3 text-sm text-red-600">{deleteError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="rounded-md border px-4 py-2 text-sm dark:border-navy-600"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                disabled={!canSubmitDelete}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "I understand, delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="rounded-xl bg-white p-6 text-center shadow-xl dark:bg-navy-800">
            <h3 className="text-lg font-semibold">Organisation deleted</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Signing you out…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
