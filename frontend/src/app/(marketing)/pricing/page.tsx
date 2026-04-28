import Link from "next/link";

export const metadata = {
  title: "Pricing — Callora",
  description:
    "Simple, transparent pricing for Callora. Pick the plan that matches your call volume. Upgrade anytime.",
};

type Plan = {
  name: string;
  price: string;
  priceSuffix?: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    price: "$99",
    priceSuffix: "/mo",
    blurb: "500 calls/mo · 1,000 leads/mo",
    features: [
      "Built-in CRM",
      "AI qualification",
      "Call transcripts",
      "Email support",
    ],
    cta: { label: "Start Free Trial", href: "/register" },
  },
  {
    name: "Pro",
    price: "$299",
    priceSuffix: "/mo",
    blurb: "2,000 calls/mo · 5,000 leads/mo",
    features: [
      "Everything in Starter",
      "Priority support",
      "Custom AI prompt tuning",
      "Slack notifications",
      "Webhook integrations",
    ],
    cta: { label: "Start Free Trial", href: "/register" },
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    blurb: "Tell us your volume",
    features: [
      "Everything in Pro",
      "Dedicated success manager",
      "SSO",
      "Custom integrations",
      "Unlimited calls and leads",
    ],
    cta: { label: "Contact Sales", href: "mailto:sales@callora.ai" },
  },
];

const FAQS = [
  {
    q: "Do I need any technical knowledge?",
    a: "No. Callora is fully managed. You won't touch any API keys.",
  },
  {
    q: "What happens after my trial?",
    a: "You'll be prompted to choose a paid plan. If you don't, your account pauses — no charges, no calls.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from the billing page; you keep access until the end of the period.",
  },
  {
    q: "Where do my qualified leads end up?",
    a: "Inside Callora's CRM. Export to CSV any time, or pipe them to your own CRM via webhook (Pro+).",
  },
  {
    q: "What countries do you call?",
    a: "US and Canada at launch. Reach out for international.",
  },
];

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      className="shrink-0 mt-0.5"
    >
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <>
      <section className="bg-white pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="border border-[#E0E0E0] text-[#666] text-xs font-medium px-3 py-1 rounded-full inline-block mb-6">
            PRICING
          </span>
          <h1 className="text-5xl md:text-6xl font-bold text-[#1A1A1A] tracking-tight leading-[1.05]">
            Simple, transparent pricing
          </h1>
          <p className="mt-5 text-lg text-[#666] max-w-2xl mx-auto">
            Pick the plan that matches your call volume. Upgrade anytime.
          </p>
        </div>
      </section>

      <section className="bg-white pb-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid gap-6 md:grid-cols-3 items-stretch">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 flex flex-col ${
                  plan.highlight
                    ? "bg-[#1A1A1A] text-white border border-[#1A1A1A] shadow-xl md:scale-[1.02]"
                    : "bg-white text-[#1A1A1A] border border-[#F0F0F0] shadow-sm"
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#DC0014] text-white text-[10px] font-semibold px-3 py-1 rounded-full tracking-wider">
                    MOST POPULAR
                  </span>
                )}
                <div>
                  <div
                    className={`text-sm font-semibold ${
                      plan.highlight ? "text-white/70" : "text-[#666]"
                    }`}
                  >
                    {plan.name}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-5xl font-bold tracking-tight">
                      {plan.price}
                    </span>
                    {plan.priceSuffix && (
                      <span
                        className={`text-base font-medium ${
                          plan.highlight ? "text-white/60" : "text-[#666]"
                        }`}
                      >
                        {plan.priceSuffix}
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-2 text-sm ${
                      plan.highlight ? "text-white/70" : "text-[#666]"
                    }`}
                  >
                    {plan.blurb}
                  </p>
                </div>

                <ul
                  className={`mt-8 space-y-3 text-sm flex-1 ${
                    plan.highlight ? "text-white/90" : "text-[#1A1A1A]"
                  }`}
                >
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className="text-[#DC0014]">
                        <CheckIcon />
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.cta.href}
                  className={`mt-8 inline-flex justify-center items-center rounded-full px-6 py-3 font-semibold transition-colors ${
                    plan.highlight
                      ? "bg-[#DC0014] text-white hover:bg-[#b8000f]"
                      : "border border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#F9F9F9]"
                  }`}
                >
                  {plan.cta.label}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#F9F9F9] py-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center">
            <span className="border border-[#E0E0E0] text-[#666] text-xs font-medium px-3 py-1 rounded-full inline-block mb-6 bg-white">
              FAQ
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] tracking-tight leading-tight">
              Common questions
            </h2>
          </div>

          <dl className="mt-12 divide-y divide-[#E8E8E8] border-t border-b border-[#E8E8E8]">
            {FAQS.map((item) => (
              <div key={item.q} className="py-6">
                <dt className="text-lg font-semibold text-[#1A1A1A]">
                  {item.q}
                </dt>
                <dd className="mt-2 text-base text-[#666] leading-relaxed">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-white py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] tracking-tight leading-tight">
            Ready to fill your pipeline?
          </h2>
          <p className="mt-4 text-lg text-[#666]">
            Start your 14-day free trial. No credit card required.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/register"
              className="bg-[#DC0014] text-white rounded-full px-6 py-3 font-semibold hover:bg-[#b8000f] transition-colors"
            >
              Start your free trial
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
