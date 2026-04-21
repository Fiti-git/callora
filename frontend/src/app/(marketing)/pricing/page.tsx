import { Pricing } from "@/components/marketing/Pricing";
import { CTABanner } from "@/components/marketing/CTABanner";
import { FAQ } from "@/components/marketing/FAQ";

export const metadata = {
  title: "Pricing — Callora",
  description:
    "Simple, transparent pricing for Callora. Start free. Scale as you grow. Cancel anytime.",
};

export default function PricingPage() {
  return (
    <>
      <section className="bg-white pt-20 pb-4">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="border border-[#E0E0E0] text-[#666] text-xs font-medium px-3 py-1 rounded-full inline-block mb-6">
            PRICING
          </span>
          <h1 className="text-5xl md:text-6xl font-bold text-[#1A1A1A] tracking-tight leading-tight">
            Simple, transparent pricing.
          </h1>
          <p className="mt-4 text-lg text-[#666] max-w-2xl mx-auto">
            Start free. Scale as you grow. Cancel anytime.
          </p>
        </div>
      </section>
      <Pricing showHeading={false} />
      <FAQ />
      <CTABanner />
    </>
  );
}
