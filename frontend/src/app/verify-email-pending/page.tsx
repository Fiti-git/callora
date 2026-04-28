import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import VerifyEmailPendingClient from "./verify-email-pending-client";

export default async function VerifyEmailPendingPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;

  return <VerifyEmailPendingClient email={email} />;
}
