import Link from "next/link";
import { getContacts } from "@/app/actions/contacts";
import Card from "@/horizon-ui/components/card";
import { MdContacts, MdSearch } from "react-icons/md";

type Contact = {
  id: string;
  businessName: string;
  phone: string;
  email: string | null;
  address: string | null;
  createdAt: string;
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  let contacts: Contact[] = [];
  let error: string | null = null;

  try {
    contacts = await getContacts(q);
  } catch (err: any) {
    error = err.message || "Failed to load contacts.";
  }

  return (
    <div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
            Contacts
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            All businesses you&apos;ve reached out to.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <Card extra="p-6">
          <form className="mb-5 flex items-center gap-2">
            <div className="flex h-12 flex-1 items-center rounded-xl bg-lightPrimary px-3 dark:bg-navy-900">
              <MdSearch className="h-5 w-5 text-gray-600 dark:text-white" />
              <input
                name="q"
                type="text"
                defaultValue={q || ""}
                placeholder="Search by business name or phone..."
                className="ml-2 h-full w-full bg-transparent text-sm text-navy-700 outline-none placeholder:text-gray-500 dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
            >
              Search
            </button>
            {q ? (
              <Link
                href="/contacts"
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-navy-700 hover:bg-gray-50 dark:border-white/10 dark:text-white dark:hover:bg-navy-800"
              >
                Clear
              </Link>
            ) : null}
          </form>

          {error ? (
            <div className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">
              {error}
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-lightPrimary dark:bg-navy-700">
                <MdContacts className="h-7 w-7 text-gray-600 dark:text-white" />
              </div>
              <p className="mb-1 text-base font-bold text-navy-700 dark:text-white">
                {q ? "No contacts match your search" : "No contacts yet"}
              </p>
              <p className="mb-5 text-sm text-gray-600">
                {q
                  ? "Try a different name or phone number."
                  : "Contacts are auto-created when you import leads or run campaigns."}
              </p>
              {!q ? (
                <Link
                  href="/campaigns/new"
                  className="text-sm font-bold text-brand-500 hover:text-brand-600"
                >
                  Start a campaign →
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-white/10">
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
                        <Link
                          href={`/contacts/${c.id}`}
                          className="font-bold text-navy-700 hover:text-brand-500 dark:text-white"
                        >
                          {c.businessName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {c.phone}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {c.email || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {c.address || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
