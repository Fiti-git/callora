"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSecret, deleteSecret } from "../actions";

interface SecretItem {
  key: string;
  label: string;
  description: string;
  required: boolean;
  cleartext: boolean;
  isSet: boolean;
  preview: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export function SecretsForm({ items }: { items: SecretItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <SecretRow key={item.key} item={item} />
      ))}
    </div>
  );
}

function SecretRow({ item }: { item: SecretItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(!item.isSet);
  const [msg, setMsg] = useState<string | null>(null);

  function handleSave() {
    if (!value) return;
    setMsg(null);
    startTransition(async () => {
      const r = await saveSecret(item.key, value);
      if (r.ok) {
        setMsg("Saved");
        setValue("");
        setEditing(false);
        router.refresh();
      } else {
        setMsg(`Error: ${r.error}`);
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Unset ${item.label}?`)) return;
    startTransition(async () => {
      const r = await deleteSecret(item.key);
      if (r.ok) {
        setMsg("Deleted");
        router.refresh();
      } else {
        setMsg(`Error: ${r.error}`);
      }
    });
  }

  return (
    <div className="border border-slate-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{item.label}</span>
            {item.required && (
              <span className="text-xs bg-red-900/60 text-red-200 px-2 py-0.5 rounded">required</span>
            )}
            {item.isSet ? (
              <span className="text-xs bg-emerald-900/60 text-emerald-200 px-2 py-0.5 rounded">set</span>
            ) : (
              <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">empty</span>
            )}
          </div>
          <div className="text-slate-400 text-xs mt-1">{item.description}</div>
          <code className="text-slate-500 text-xs">{item.key}</code>
        </div>
        {item.isSet && !editing && (
          <div className="text-right text-xs text-slate-400">
            <div className="font-mono text-slate-300">{item.preview}</div>
            {item.updatedAt && (
              <div className="mt-1">
                Updated {new Date(item.updatedAt).toLocaleString()}
                {item.updatedBy ? ` by ${item.updatedBy}` : ""}
              </div>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex gap-2 mt-3">
          <input
            type={item.cleartext ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={item.isSet ? "Enter new value to overwrite" : "Enter value"}
            className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 font-mono text-sm"
            autoComplete="off"
          />
          <button
            onClick={handleSave}
            disabled={pending || !value}
            className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold px-4 rounded"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {item.isSet && (
            <button
              onClick={() => {
                setEditing(false);
                setValue("");
              }}
              className="bg-slate-800 hover:bg-slate-700 px-4 rounded text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setEditing(true)}
            className="bg-slate-800 hover:bg-slate-700 px-4 py-1.5 rounded text-sm"
          >
            Replace
          </button>
          <button
            onClick={handleDelete}
            disabled={pending}
            className="bg-red-950 hover:bg-red-900 text-red-200 px-4 py-1.5 rounded text-sm"
          >
            Unset
          </button>
        </div>
      )}

      {msg && <div className="text-xs text-slate-400 mt-2">{msg}</div>}
    </div>
  );
}
