const ITEMS = [
  {
    quote:
      "We were skeptical about AI calling, but Callora is genuinely getting us 15-20 callbacks a week. It's the highest-leverage thing we've added to our sales motion.",
    name: "Priya Mehta",
    role: "Director of Sales",
    location: "Toronto, Ontario",
  },
  {
    quote:
      "The CASL and DNCL integration is what sold us. Outbound felt risky for years — Callora makes it safe again, and the qualification scoring saves hours every week.",
    name: "James Whitfield",
    role: "Managing Partner",
    location: "Vancouver, BC",
  },
  {
    quote:
      "We hit 400 prospects in our first week. Two enterprise demos came directly out of those calls. The ROI math is honestly absurd.",
    name: "Wei Tan",
    role: "Co-founder, SaaS Startup",
    location: "Singapore",
  },
];

export function Testimonials() {
  return (
    <section className="bg-[#F9F9F9] py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="border border-[#E0E0E0] text-[#666] text-xs font-medium px-3 py-1 rounded-full inline-block mb-6 bg-white">
            TESTIMONIALS
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] tracking-tight leading-tight">
            Trusted by sales teams across Canada and Singapore.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {ITEMS.map((t) => (
            <div
              key={t.name}
              className="bg-[#1A1A1A] rounded-2xl p-8 text-white flex flex-col"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="#DC0014"
                className="mb-5"
              >
                <path d="M9.7 8C8 8 6.5 8.7 5.5 10c-1 1.3-1.5 2.8-1.5 4.5 0 1.4.4 2.5 1.2 3.4.8.8 1.8 1.2 3 1.2 1 0 1.9-.3 2.6-1 .7-.7 1-1.5 1-2.5 0-.9-.3-1.7-.9-2.3-.6-.6-1.4-.9-2.3-.9h-.6c.2-.7.6-1.4 1.2-2C9.8 9.6 10.6 9 11.5 8.6L9.7 8zm9 0c-1.7 0-3.2.7-4.2 2-1 1.3-1.5 2.8-1.5 4.5 0 1.4.4 2.5 1.2 3.4.8.8 1.8 1.2 3 1.2 1 0 1.9-.3 2.6-1 .7-.7 1-1.5 1-2.5 0-.9-.3-1.7-.9-2.3-.6-.6-1.4-.9-2.3-.9h-.6c.2-.7.6-1.4 1.2-2 .6-.7 1.4-1.3 2.3-1.7L18.7 8z" />
              </svg>
              <p className="text-base text-white/90 leading-relaxed flex-1">
                {t.quote}
              </p>
              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="text-xs text-white/50 mt-0.5">
                  {t.role} · {t.location}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
