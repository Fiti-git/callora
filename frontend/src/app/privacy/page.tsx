import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Callora",
  description: "Privacy Policy for Callora, including PIPEDA, CASL, and PDPA compliance.",
};

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Last updated: April 2025
          </p>
        </header>

        <article className="prose prose-gray dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-red-600 prose-a:no-underline hover:prose-a:underline">
          <section>
            <h2>1. Information We Collect</h2>
            <p>
              When you register and use Callora, we collect information you provide directly, such as your
              name, email address, organization name, and password. As you operate the Service we also
              collect information about the leads you discover or upload, including business names, phone
              numbers, addresses, and any notes you attach. We store call transcripts, call metadata, and
              AI-generated summaries for each outbound call placed through the platform. We automatically
              collect technical data such as IP addresses, browser type, and usage events to operate and
              secure the Service.
            </p>
          </section>

          <section>
            <h2>2. How We Use Information</h2>
            <p>
              We use the information we collect to provide, maintain, and improve the Service; to
              authenticate users; to operate the lead discovery, qualification, and calling pipeline; to
              process payments; to send transactional emails (welcome messages, qualified lead alerts,
              trial expiry reminders, password resets, and billing notifications); and to enforce our
              Terms. We do not sell personal information to third parties.
            </p>
          </section>

          <section>
            <h2>3. Data Storage and Security</h2>
            <p>
              Data is stored in managed PostgreSQL databases with encryption at rest. Passwords are hashed
              using bcrypt and are never stored in plain text. API keys for third-party services are
              encrypted at the application layer. All traffic between your browser and Callora is
              transmitted over TLS. We apply the principle of least privilege to engineering access to
              production systems.
            </p>
          </section>

          <section>
            <h2>4. Third-Party Services</h2>
            <p>
              Callora integrates with the following third-party services. Each receives only the data
              necessary to perform its specific function:
            </p>
            <ul>
              <li>
                <strong>Google Maps Platform (Places API):</strong> receives search queries (e.g. a
                business category and geographic area) that you configure in a campaign. Used for business
                discovery.
              </li>
              <li>
                <strong>Google Gemini API:</strong> receives campaign prompts, lead metadata, and call
                transcripts so that the AI can qualify leads and summarize conversations. Your API key is
                transmitted alongside each request.
              </li>
              <li>
                <strong>Vapi.ai:</strong> receives phone numbers, AI caller configuration, and system
                prompts for the purpose of placing outbound calls. Vapi returns call recordings and
                transcripts to Callora.
              </li>
              <li>
                <strong>Stripe:</strong> receives billing contact details and payment method information
                for subscription processing. Callora never stores full card details &mdash; they remain with
                Stripe.
              </li>
              <li>
                <strong>Resend:</strong> receives email addresses and transactional email content so that
                notifications can be delivered to your inbox.
              </li>
            </ul>
          </section>

          <section>
            <h2>5. Data Retention</h2>
            <p>
              Account data is retained for as long as your account is active. Call logs, transcripts, and
              lead records are retained for the life of your organization&rsquo;s account and for a reasonable
              period after cancellation to comply with legal obligations and to facilitate reactivation.
              You may request deletion of your personal data at any time.
            </p>
          </section>

          <section>
            <h2>6. Your Rights</h2>
            <p>
              Depending on your jurisdiction, you have rights to access, correct, port, or delete your
              personal information. You also have the right to withdraw consent where we rely on consent
              as the legal basis for processing. To exercise these rights, contact{" "}
              <a href="mailto:hello@callora.ai">hello@callora.ai</a>.
            </p>
          </section>

          <section>
            <h2>7. For Canadian Users</h2>
            <p>
              We comply with the Personal Information Protection and Electronic Documents Act (PIPEDA)
              and Canada&rsquo;s Anti-Spam Legislation (CASL). You may request access to your personal
              information by contacting us at{" "}
              <a href="mailto:hello@callora.ai">hello@callora.ai</a>.
            </p>
          </section>

          <section>
            <h2>8. For Singapore Users</h2>
            <p>
              Personal data is handled in accordance with the Personal Data Protection Act 2012 (PDPA). To
              exercise your rights of access, correction, or deletion, contact our Data Protection Officer
              at <a href="mailto:hello@callora.ai">hello@callora.ai</a>.
            </p>
          </section>

          <section>
            <h2>9. Do Not Call Compliance</h2>
            <p>
              For Canadian campaigns, Callora checks numbers against the Canadian Do Not Call List (DNCL)
              rules and against your organization&rsquo;s blacklist before calls are placed. It is your
              responsibility to ensure that the leads you target have a valid business relationship or
              legal basis for contact under applicable telemarketing laws.
            </p>
          </section>

          <section>
            <h2>10. Updates to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we make material changes we will
              notify you by email or through the Service. The &ldquo;Last updated&rdquo; date at the top of this
              page reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2>11. Contact Information</h2>
            <p>
              For privacy-related questions or requests, email us at{" "}
              <a href="mailto:hello@callora.ai">hello@callora.ai</a>. We aim to respond within a reasonable
              period, typically within five business days.
            </p>
          </section>
        </article>

        <footer className="mt-16 border-t border-gray-200 dark:border-gray-800 pt-6 text-xs text-gray-500 dark:text-gray-400">
          <p>
            Callora is a product of Redot Global. See our{" "}
            <Link href="/terms" className="underline hover:text-gray-700 dark:hover:text-gray-200">
              Terms of Service
            </Link>{" "}
            for the complete agreement governing use of the Service.
          </p>
        </footer>
      </div>
    </div>
  );
}
