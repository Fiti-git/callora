"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useToast } from "@/components/ui/toast";
import {
  addContactsToList,
  removeListMember,
  importListCsv,
  updateList,
  deleteList,
} from "@/app/actions/email-marketing";

interface Member {
  id: string;
  email: string;
  source: string;
  subscribedAt: string;
  unsubscribedAt: string | null;
}

interface List {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
}

export function ListDetailClient({
  list,
  initialMembers,
}: {
  list: List;
  initialMembers: Member[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [tab, setTab] = useState<"members" | "settings">("members");
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [memberCount, setMemberCount] = useState<number>(list.memberCount ?? initialMembers.length);
  const [newEmail, setNewEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  function onAddEmail() {
    const trimmed = newEmail.trim();
    if (!trimmed || !/^[^@]+@[^@]+$/.test(trimmed)) {
      showToast("error", "Enter a valid email");
      return;
    }
    startTransition(async () => {
      try {
        const res = await addContactsToList(list.id, { emails: [trimmed] });
        showToast("success", `Added ${res.inserted} (skipped ${res.skipped})`);
        setMemberCount(res.memberCount);
        setNewEmail("");
        router.refresh();
      } catch (err: any) {
        showToast("error", err?.message || "Failed to add");
      }
    });
  }

  function onRemove(memberId: string) {
    if (!confirm("Remove this member?")) return;
    startTransition(async () => {
      try {
        await removeListMember(list.id, memberId);
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
        setMemberCount((c) => Math.max(0, c - 1));
      } catch (err: any) {
        showToast("error", err?.message || "Failed to remove");
      }
    });
  }

  function onCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      try {
        const res = await importListCsv(list.id, fd);
        showToast("success", `Imported ${res.inserted}, skipped ${res.skipped}`);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch (err: any) {
        showToast("error", err?.message || "CSV import failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white truncate">
            {list.name}
          </h1>
          {list.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{list.description}</p>
          )}
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {memberCount.toLocaleString()} members
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setTab("members")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "members"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          Members
        </button>
        <button
          onClick={() => setTab("settings")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "settings"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          Settings
        </button>
      </div>

      {tab === "members" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddEmail();
              }}
              placeholder="someone@example.com"
              className="flex-1 min-w-[220px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
            <button
              onClick={onAddEmail}
              disabled={isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onCsvChange}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isPending}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Import CSV
            </button>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <Th>Email</Th>
                  <Th>Source</Th>
                  <Th>Subscribed</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No members yet.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.id}>
                      <td className="px-6 py-2 text-sm text-gray-900 dark:text-gray-100">
                        {m.email}
                      </td>
                      <td className="px-6 py-2 text-xs text-gray-500 dark:text-gray-400">
                        {m.source}
                      </td>
                      <td className="px-6 py-2 text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(m.subscribedAt), "MMM d, yyyy")}
                      </td>
                      <td className="px-6 py-2 text-right">
                        <button
                          onClick={() => onRemove(m.id)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "settings" && <SettingsTab list={list} />}
    </div>
  );
}

function SettingsTab({ list }: { list: List }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    try {
      await updateList(list.id, {
        name,
        description: description || null,
      });
      showToast("success", "Saved");
      router.refresh();
    } catch (err: any) {
      showToast("error", err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this list? This cannot be undone.")) return;
    try {
      await deleteList(list.id);
      showToast("success", "List deleted");
      router.push("/email-marketing/lists");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to delete");
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4 max-w-xl">
      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onDelete}
          className="rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-red-600"
        >
          Delete list
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-6 py-2 ${
        align === "right" ? "text-right" : "text-left"
      } text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide`}
    >
      {children}
    </th>
  );
}
