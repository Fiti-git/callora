import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import VerifyEmailClient from "./verify-email-client";

export default async function VerifyEmailPage() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = Boolean(session?.user?.accessToken);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-lightPrimary dark:bg-navy-900" />
      }
    >
      <VerifyEmailClient isLoggedIn={isLoggedIn} />
    </Suspense>
  );
}
