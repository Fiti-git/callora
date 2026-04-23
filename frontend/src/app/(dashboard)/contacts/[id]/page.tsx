import Link from "next/link";
import { getContact } from "@/app/actions/contacts";
import Card from "@/horizon-ui/components/card";
import { MdArrowBack } from "react-icons/md";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let contact: any = null;
  let error: string | null = null;

  try {
    contact = await getContact(id);
  } catch (err: any) {
    error = err.message || "Failed to load contact.";
  }

  return (
    <div>
      <div className="mt-3">
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          <MdArrowBack className="h-4 w-4" />
          Back to contacts
        </Link>
      </div>

      <div className="mt-3">
        <Card extra="p-6">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !contact ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
                {contact.businessName}
              </h1>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Phone" value={contact.phone} />
                <Field label="Email" value={contact.email || "—"} />
                <Field
                  label="Address"
                  value={contact.address || "—"}
                  full
                />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <Stat label="Leads" value={contact.leads?.length || 0} />
                <Stat label="Deals" value={contact.deals?.length || 0} />
                <Stat label="Tasks" value={contact.tasks?.length || 0} />
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  full = false,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-600">
        {label}
      </p>
      <p className="mt-1 text-base font-medium text-navy-700 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-900">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-600">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">
        {value}
      </p>
    </div>
  );
}
