import Card from "@/horizon-ui/components/card";
import { getAssignedNumber } from "@/app/actions/phone-number";

/**
 * Settings → Phone Number card. Read-only. Shows the org's dedicated
 * outbound number when assigned, or a "Shared trial number" label if
 * provisioning is still pending (e.g. trial orgs using the pool).
 */
export default async function PhoneNumberCard() {
  const number = await getAssignedNumber();

  const isDedicated = !!number?.isDedicated && !!number?.e164;
  const display = isDedicated ? number!.e164 : "Shared trial number";
  const sub = isDedicated
    ? `Status: ${number!.status}`
    : "Trial accounts share a Callora-managed pool number. Upgrade to a paid plan to receive your own dedicated number.";

  return (
    <Card extra="p-0">
      <div className="border-b border-gray-200 px-6 py-5 dark:border-white/10">
        <h2 className="text-lg font-bold text-navy-700 dark:text-white">
          Phone Number
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          The outbound number Callora uses for your AI calls.
        </p>
      </div>
      <div className="px-6 py-5">
        <div className="rounded-xl border border-gray-200 bg-lightPrimary px-4 py-3 dark:border-white/10 dark:bg-navy-900/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Assigned number
          </div>
          <div className="mt-1 text-base font-semibold text-navy-700 dark:text-white">
            {display}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{sub}</p>
        </div>
      </div>
    </Card>
  );
}
