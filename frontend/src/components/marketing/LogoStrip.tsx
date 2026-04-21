const STATS = [
  { value: "1,200+", label: "Businesses reached weekly" },
  { value: "48 hrs", label: "Average time to first lead" },
  { value: "3×", label: "More pipeline vs manual" },
  { value: "100%", label: "CASL & PDPA compliant" },
];

export function LogoStrip() {
  return (
    <section id="features" className="bg-white border-y border-[#F0F0F0] py-10">
      <div className="max-w-6xl mx-auto px-6">
        <p className="text-center text-sm text-[#999] mb-8">
          Trusted by businesses across Canada &amp; Singapore
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-bold text-[#DC0014]">{s.value}</div>
              <div className="mt-1 text-sm text-[#666]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
