import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "Callora — AI-Powered Lead Generation for Canada & Singapore",
  description:
    "Callora finds real businesses, qualifies them with Gemini AI, and calls them on your behalf. CASL and PDPA compliant. Start your free 14-day trial.",
  openGraph: {
    title: "Callora — Your next client is one call away.",
    description:
      "AI-powered lead discovery, qualification, and outbound calling for businesses in Canada and Singapore.",
    url: "https://callora.ai",
    type: "website",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white text-[#1A1A1A]">
      <Navbar />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
