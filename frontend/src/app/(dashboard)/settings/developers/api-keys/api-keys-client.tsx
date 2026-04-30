"use client";

import { useState, useTransition } from "react";
import {
  PublicApiKey,
  createPublicApiKey,
  revokePublicApiKey,
} from "@/app/actions/api-keys";

const SCOPES = ["read", "write", "webhook"];

export default function ApiKeysClient({
  initial,
  error,
}: {
  initial: PublicApiKey[];
  error: string | null;
}) {
  const [keys, setKeys] = useState<PublicApiKey[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function toggleScope(s: string) {
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name || scopes.length === 0) return;
    startTransition(async () => {
      try {
        const created = await createPublicApiKey({ name, scopes });
        setKeys((arr) => [created, ...arr]);
        setRevealed(created.key);
        setName("");
        setScopes(["read"]);
        setShowCreate(false);
      } catch (err: any) {
        alert(err.message);
      }
    });
  }

  async function onRevoke(id: string) {
    if (!confirm("Revoke this key? Existing integrations will stop working immediately.")) return;
    startTransition(async () => {
      await revokePublicApiKey(id);
      setKeys((arr) => arr.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)));
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-700 dark:text-white">API Keys</h1>
          <p className="text-sm text-gray-500">
            Bearer tokens for programmatic access to /api/v1/*.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white"
        >
          {showCreate ? "Cancel" : "New API Key"}
        </button>
      </div>

      {error && <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-700">{error}</div>}

      {revealed && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">
            Save this key now — we will not show it again.
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-3 font-mono text-xs">{revealed}</pre>
          <button
            onClick={() => navigator.clipboard.writeText(revealed)}
            className="mt-2 rounded bg-amber-200 px-3 py-1 text-xs"
          >
            Copy
          </button>
          <button
            onClick={() => setRevealed(null)}
            className="ml-2 mt-2 rounded bg-gray-200 px-3 py-1 text-xs"
          >
            I&apos;ve saved it
          </button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={onCreate} className="space-y-4 rounded-xl border bg-white p-4 dark:bg-navy-800">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded border px-3 text-sm"
              placeholder="Zapier production"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Scopes</label>
            <div className="flex gap-3">
              {SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={() => toggleScope(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white"
          >
            Create
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border bg-white dark:bg-navy-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-navy-700">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Key</th>
              <th className="p-3 text-left">Scopes</th>
              <th className="p-3 text-left">Last used</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-400">
                  No API keys yet.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} className="border-t">
                <td className="p-3">{k.name}</td>
                <td className="p-3 font-mono text-xs">{k.maskedKey}</td>
                <td className="p-3">{k.scopes.join(", ")}</td>
                <td className="p-3 text-xs text-gray-500">
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}
                </td>
                <td className="p-3">
                  {k.revokedAt ? (
                    <span className="text-red-600">Revoked</span>
                  ) : (
                    <span className="text-green-700">Active</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  {!k.revokedAt && (
                    <button onClick={() => onRevoke(k.id)} className="text-xs text-red-600">
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
