"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addToBlacklist, removeFromBlacklist } from "@/app/actions/blacklist";
import { format } from "date-fns";
import toast from "react-hot-toast";

interface BlacklistEntry {
  id: string;
  phoneNumber: string;
  reason: string | null;
  createdAt: string;
}

export function BlacklistManager({ initial }: { initial: BlacklistEntry[] }) {
  const [entries, setEntries] = useState<BlacklistEntry[]>(initial);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setAdding(true);
    try {
      const result = await addToBlacklist(phone.trim(), reason.trim() || undefined);
      if (result?.error) throw new Error(result.error);
      toast.success("Number blacklisted.");
      setPhone("");
      setReason("");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string, number: string) {
    try {
      await removeFromBlacklist(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success(`${number} removed from blacklist.`);
    } catch {
      toast.error("Failed to remove.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Add Number to Blacklist</h3>
        <form onSubmit={handleAdd} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Phone Number</label>
            <input
              type="text"
              placeholder="+1 555 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Reason (optional)</label>
            <input
              type="text"
              placeholder="e.g. Requested no contact"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {adding ? "Adding..." : "Add to Blacklist"}
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Phone Number</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reason</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date Added</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-400">
                  No numbers blacklisted yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-900">{entry.phoneNumber}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{entry.reason || "-"}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {format(new Date(entry.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRemove(entry.id, entry.phoneNumber)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
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
  );
}
