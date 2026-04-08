"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";

interface TeamMember {
  id: string;
  name?: string;
  email: string;
  role: string;
  createdAt: string;
}

const ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;

const ROLE_STYLES: Record<string, string> = {
  ADMIN: "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
  MEMBER: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  VIEWER: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

async function updateRole(userId: string, role: string) {
  return fetchWithAuth(`/settings/team/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function TeamManager({
  team,
  currentUserId,
}: {
  team: TeamMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleRoleChange(userId: string, role: string) {
    setLoading(userId);
    setError("");
    try {
      await updateRole(userId, role);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {team.map((member) => (
          <div key={member.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {member.name || member.email}
                {member.id === currentUserId && (
                  <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">(you)</span>
                )}
              </p>
              {member.name && <p className="text-xs text-gray-400 dark:text-gray-500">{member.email}</p>}
            </div>
            <div className="flex items-center gap-2">
              {member.id === currentUserId ? (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_STYLES[member.role]}`}>
                  {member.role}
                </span>
              ) : (
                <select
                  value={member.role}
                  disabled={loading === member.id}
                  onChange={(e) => handleRoleChange(member.id, e.target.value)}
                  className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
