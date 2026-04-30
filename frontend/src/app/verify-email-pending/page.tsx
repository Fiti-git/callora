import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import VerifyEmailPendingClient from "./verify-email-pending-client";

export default async function VerifyEmailPendingPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  const session = await getServerSession(authOptions);
  // Prefer the URL `?email=` (post-register flow when there's no session yet).
  const email = searchParams?.email || session?.user?.email || null;

  return <VerifyEmailPendingClient email={email} />;
}
