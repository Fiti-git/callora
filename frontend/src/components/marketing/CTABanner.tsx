import Link from "next/link";
import { Decorations } from "./Decorations";

const AVATARS = [
  { initial: "A", color: "#DC0014" },
  { initial: "R", color: "#1A1A1A" },
  { initial: "S", color: "#666666" },
];

export function CTABanner() {
  return (
    <section className="relative bg-white py-32 text-center overflow-hidden">
      <Decorations variant="default" />
      <div className="relative z-10 max-w-3xl mx-auto px-6 flex flex-col items-center">
        <div className="flex items-center mb-5">
          {AVATARS.map((a, i) => (
            <div
              key={a.initial}
              className="w-9 h-9 rounded-full text-white text-xs font-semibold flex items-center justify-center border-2 border-white shadow-sm"
              style={{
                backgroundColor: a.color,
                marginLeft: i === 0 ? 0 : -10,
                zIndex: AVATARS.length - i,
              }}
            >
              {a.initial}
            </div>
          ))}
        </div>

        <p className="text-xs font-semibold text-[#999] tracking-[0.18em] uppercase mb-6">
          Join Businesses Across Canada &amp; Singapore
        </p>

        <h2 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] tracking-tight leading-tight">
          Ready to fill your pipeline?
        </h2>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/register"
            className="bg-[#DC0014] text-white rounded-full px-6 py-3 font-semibold hover:bg-[#b8000f] transition-colors"
          >
            Start Free Trial
          </Link>
          <a
            href="mailto:hello@callora.ai?subject=Callora%20Demo"
            className="border border-[#1A1A1A] text-[#1A1A1A] rounded-full px-6 py-3 font-semibold hover:bg-[#F9F9F9] transition-colors"
          >
            Book a Demo
          </a>
        </div>
      </div>
    </section>
  );
}
