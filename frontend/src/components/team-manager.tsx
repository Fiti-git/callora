"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";
import { MdPerson } from "react-icons/md";

interface TeamMember {
  id: string;
  name?: string;
  email: string;
  role: string;
  createdAt: string;
}

const ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;

const ROLE_STYLES: Record<string, string> = {
  ADMIN: "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-200",
  MEMBER: "bg-horizonBlue-100 text-horizonBlue-600 dark:bg-horizonBlue-500/20 dark:text-horizonBlue-200",
  VIEWER: "bg-lightPrimary text-gray-700 dark:bg-navy-900 dark:text-gray-300",
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

  if (team.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl bg-lightPrimary py-10 text-center dark:bg-navy-900">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-navy-800">
          <MdPerson className="h-6 w-6 text-gray-600 dark:text-white" />
        </div>
        <p className="text-sm font-bold text-navy-700 dark:text-white">
          No team members yet
        </p>
        <p className="mt-1 text-xs text-gray-600">
          You&apos;re the only one here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
        <table className="min-w-full">
          <thead className="bg-lightPrimary dark:bg-navy-900">
            <tr className="text-left text-xs font-bold uppercase tracking-wider text-gray-600">
              <th className="px-5 py-3">Member</th>
              <th className="px-5 py-3">Joined</th>
              <th className="px-5 py-3 text-right">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-white/10 dark:bg-navy-800">
            {team.map((member) => {
              const isYou = member.id === currentUserId;
              return (
                <tr key={member.id} className="text-sm">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-brandLinear to-brand-500 font-bold text-white">
                        {(member.name || member.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-navy-700 dark:text-white">
                          {member.name || member.email}
                          {isYou ? (
                            <span className="ml-1.5 text-xs font-medium text-gray-500">
                              (you)
                            </span>
                          ) : null}
                        </p>
                        {member.name ? (
                          <p className="truncate text-xs text-gray-600">
                            {member.email}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-700 dark:text-gray-300">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {isYou ? (
                      <span
                        className={
                          "inline-block rounded-full px-3 py-1 text-xs font-bold " +
                          ROLE_STYLES[member.role]
                        }
                      >
                        {member.role}
                      </span>
                    ) : (
                      <select
                        value={member.role}
                        disabled={loading === member.id}
                        onChange={(e) =>
                          handleRoleChange(member.id, e.target.value)
                        }
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-navy-700 outline-none focus:border-brand-500 disabled:opacity-50 dark:border-white/10 dark:bg-navy-900 dark:text-white"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
