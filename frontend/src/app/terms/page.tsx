import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Callora",
  description: "Terms of Service for Callora, the AI-powered lead generation platform by Redot Global.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-10 border-b border-gray-200 dark:border-gray-800 pb-6">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            &larr; Back to Callora
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Last updated: April 2025
          </p>
        </header>

        <article className="prose prose-gray dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-red-600 prose-a:no-underline hover:prose-a:underline">
          <section>
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using Callora (the &ldquo;Service&rdquo;), operated by Redot Global (&ldquo;we,&rdquo;
              &ldquo;us,&rdquo; or &ldquo;our&rdquo;), you agree to be bound by these Terms of Service and our Privacy
              Policy. If you do not agree with any part of these terms, you must not use the Service.
              Your continued use of Callora constitutes ongoing acceptance of these terms, including any
              future updates we may make.
            </p>
          </section>

          <section>
            <h2>2. Description of Service</h2>
            <p>
              Callora is an AI-powered lead generation and outbound calling platform. The Service combines
              Google Places business discovery, Google Gemini AI for lead qualification and conversation
              analysis, and Vapi.ai for automated outbound phone calls. Callora helps organizations identify
              prospective customers, qualify them through AI-driven conversations, and manage the resulting
              pipeline. The Service is delivered as a multi-tenant software-as-a-service product.
            </p>
          </section>

          <section>
            <h2>3. User Accounts and Responsibilities</h2>
            <p>
              To use Callora you must create an account and provide accurate, current, and complete
              information. You are responsible for maintaining the confidentiality of your login credentials
              and for all activity that occurs under your account. You must promptly notify us of any
              unauthorized use or suspected breach. You are responsible for ensuring that any team members
              you invite to your organization comply with these Terms.
            </p>
          </section>

          <section>
            <h2>4. Acceptable Use Policy</h2>
            <p>
              You agree not to use Callora to send spam, conduct harassment campaigns, engage in illegal
              telemarketing, or contact individuals who have not consented to being called where consent is
              legally required. You must comply with all applicable telemarketing laws, including the U.S.
              Telephone Consumer Protection Act (TCPA), Canada&rsquo;s Anti-Spam Legislation (CASL), and the
              Canadian Do Not Call List (DNCL) where applicable. You may not use the Service to transmit
              malicious code, attempt to gain unauthorized access to any system, or interfere with the
              normal operation of the Service.
            </p>
          </section>

          <section>
            <h2>5. Data and Privacy</h2>
            <p>
              Our collection and use of personal information is governed by our{" "}
              <Link href="/privacy">Privacy Policy</Link>, which is incorporated into these Terms by
              reference. By using the Service you consent to the data practices described in the Privacy
              Policy, including the processing of call transcripts and lead data through our third-party AI
              and telephony providers.
            </p>
          </section>

          <section>
            <h2>6. Payment Terms</h2>
            <p>
              Paid plans are billed on a recurring basis through Stripe, our payment processor. By
              subscribing to a paid plan you authorize Stripe to charge your payment method at the interval
              specified in your plan. Fees are non-refundable except where required by law. You may cancel
              your subscription at any time; cancellation takes effect at the end of the current billing
              period. Failed payments may result in service suspension after a grace period.
            </p>
          </section>

          <section>
            <h2>7. Limitation of Liability</h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind,
              whether express or implied. To the maximum extent permitted by law, Redot Global shall not be
              liable for any indirect, incidental, consequential, special, or punitive damages arising from
              or related to your use of the Service, including lost profits, lost data, or business
              interruption. Our total aggregate liability for any claim shall not exceed the amount you
              paid to us during the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2>8. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the jurisdiction in which Redot Global is
              incorporated, without regard to conflict-of-law principles. Users in Canada are subject to
              applicable Canadian laws including CASL. Users in Singapore are subject to the Personal Data
              Protection Act 2012 (PDPA). Any dispute arising from these Terms or the Service will be
              resolved in the courts of the governing jurisdiction, except where applicable consumer
              protection laws grant you the right to bring proceedings in your local jurisdiction.
            </p>
          </section>

          <section>
            <h2>9. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. When we make material changes we will notify you
              by email or through the Service at least thirty days before the changes take effect. Your
              continued use of the Service after the effective date constitutes acceptance of the revised
              Terms. If you do not agree to the revised Terms, you must stop using the Service and cancel
              your subscription.
            </p>
          </section>

          <section>
            <h2>10. Contact Information</h2>
            <p>
              If you have questions about these Terms, you can reach us at{" "}
              <a href="mailto:hello@callora.ai">hello@callora.ai</a>. We aim to respond to all inquiries
              within two business days.
            </p>
          </section>
        </article>

        <footer className="mt-16 border-t border-gray-200 dark:border-gray-800 pt-6 text-xs text-gray-500 dark:text-gray-400">
          <p>
            Callora is a product of Redot Global. See our{" "}
            <Link href="/privacy" className="underline hover:text-gray-700 dark:hover:text-gray-200">
              Privacy Policy
            </Link>{" "}
            for information about how we handle personal data.
          </p>
        </footer>
      </div>
    </div>
  );
}
