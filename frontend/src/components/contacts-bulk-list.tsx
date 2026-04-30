"use client";

import Link from "next/link";
import { useState } from "react";
import { BulkActionToolbar } from "./bulk-action-toolbar";
import { bulkDeleteContacts } from "@/app/actions/contacts";

type Contact = {
  id: string;
  businessName: string;
  phone: string;
  email: string | null;
  address: string | null;
  createdAt: string;
};

/**
 * Client wrapper around the contacts table that adds row-selection +
 * BulkActionToolbar wiring. Server component still owns data-fetch.
 */
export function ContactsBulkList({ contacts }: { contacts: Contact[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allOnPage = contacts.length > 0 && contacts.every((c) => selected.has(c.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      allOnPage ? new Set() : new Set(contacts.map((c) => c.id))
    );
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-white/10">
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={toggleAll}
                  aria-label="Select all on this page"
                />
              </th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-white/10">
            {contacts.map((c) => (
              <tr
                key={c.id}
                className="text-sm hover:bg-lightPrimary dark:hover:bg-navy-900"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    aria-label={`Select ${c.businessName}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/contacts/${c.id}`}
                    className="font-bold text-navy-700 hover:text-brand-500 dark:text-white"
                  >
                    {c.businessName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.phone}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.email || "—"}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.address || "—"}</td>
                <td className="px-4 py-3 text-gray-600">
                  {new Date(c.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BulkActionToolbar
        selectedIds={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        actions={[
          {
            label: "Delete",
            variant: "danger",
            action: async (ids) => {
              await bulkDeleteContacts(ids);
            },
          },
        ]}
      />
    </>
  );
}
