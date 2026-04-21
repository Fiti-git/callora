import { Navbar } from "@/components/marketing/Navbar";
import { Hero } from "@/components/marketing/Hero";
import { LogoStrip } from "@/components/marketing/LogoStrip";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Features } from "@/components/marketing/Features";
import { BeforeAfter } from "@/components/marketing/BeforeAfter";
import { Pricing } from "@/components/marketing/Pricing";
import { Compliance } from "@/components/marketing/Compliance";
import { Testimonials } from "@/components/marketing/Testimonials";
import { FAQ } from "@/components/marketing/FAQ";
import { CTABanner } from "@/components/marketing/CTABanner";
import { Footer } from "@/components/marketing/Footer";

export const metadata = {
  title: "Callora — AI-Powered Lead Generation for Canada & Singapore",
  description:
    "Callora finds your ideal business prospects, qualifies them with AI, and calls them on your behalf. CASL and PDPA compliant. Start your free 14-day trial.",
  keywords:
    "AI lead generation, outbound calling, sales automation, Canada, Singapore, CASL compliant, PDPA compliant",
  openGraph: {
    title: "Callora — Your next client is one call away.",
    description:
      "AI-powered lead discovery, qualification, and outbound calling for businesses in Canada and Singapore.",
    url: "https://callora.ai",
    type: "website",
  },
};

export default function Home() {
  return (
    <div className="bg-white text-[#1A1A1A]">
      <Navbar />
      <main>
        <Hero />
        <LogoStrip />
        <HowItWorks />
        <Features />
        <BeforeAfter />
        <Pricing />
        <Compliance />
        <Testimonials />
        <FAQ />
        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}
