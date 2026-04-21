const BEFORE = [
  "Spending hours finding prospect numbers",
  "Paying $4-8k/month for a sales rep",
  "No way to know if a lead is worth calling",
  "Calling lists one by one manually",
];

const AFTER = [
  "AI discovers qualified prospects automatically",
  "Your AI caller works 24/7 for a fraction of the cost",
  "Every lead scored before a call is made",
  "Campaigns run hands-free across hundreds of leads",
];

export function BeforeAfter() {
  return (
    <section className="bg-white py-24">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-center text-4xl md:text-5xl font-bold text-[#1A1A1A] tracking-tight max-w-3xl mx-auto leading-tight">
          Sales prospecting is broken for most businesses.
        </h2>

        <div className="mt-14 grid md:grid-cols-2 gap-6">
          <div className="bg-[#F9F9F9] border border-[#E8E8E8] rounded-2xl p-8">
            <div className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-6">
              Before Callora
            </div>
            <ul className="space-y-4">
              {BEFORE.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[#E8E8E8] text-[#999] text-xs font-bold flex items-center justify-center mt-0.5">
                    ×
                  </span>
                  <span className="text-[#666] text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-[#1A1A1A] rounded-2xl p-8 text-white">
            <div className="text-xs font-semibold text-[#DC0014] uppercase tracking-wider mb-6">
              With Callora
            </div>
            <ul className="space-y-4">
              {AFTER.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[#DC0014] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    ✓
                  </span>
                  <span className="text-white/90 text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
