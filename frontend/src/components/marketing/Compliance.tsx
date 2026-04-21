export function Compliance() {
  return (
    <section id="compliance" className="bg-white py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="border border-[#E0E0E0] text-[#666] text-xs font-medium px-3 py-1 rounded-full inline-block mb-6">
            COMPLIANCE
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] tracking-tight leading-tight">
            Built for Canada and Singapore.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-[#F9F9F9] border border-[#E8E8E8] rounded-2xl p-8">
            <div className="text-3xl mb-4">🇨🇦</div>
            <div className="text-xl font-bold text-[#1A1A1A]">Canada</div>
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-sm font-semibold text-[#1A1A1A]">CASL</div>
                <p className="mt-1 text-sm text-[#666] leading-relaxed">
                  Every campaign honours Canada&apos;s Anti-Spam Legislation rules
                  for commercial outreach, including identification and unsubscribe
                  pathways.
                </p>
              </div>
              <div>
                <div className="text-sm font-semibold text-[#1A1A1A]">DNCL</div>
                <p className="mt-1 text-sm text-[#666] leading-relaxed">
                  Numbers are scrubbed against Canada&apos;s National Do Not Call
                  List before any dial attempt is made.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#F9F9F9] border border-[#E8E8E8] rounded-2xl p-8">
            <div className="text-3xl mb-4">🇸🇬</div>
            <div className="text-xl font-bold text-[#1A1A1A]">Singapore</div>
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-sm font-semibold text-[#1A1A1A]">PDPA</div>
                <p className="mt-1 text-sm text-[#666] leading-relaxed">
                  Personal Data Protection Act compliance — including consent
                  handling, data minimisation and PDPC do-not-call register
                  checks.
                </p>
              </div>
              <div>
                <div className="text-sm font-semibold text-[#1A1A1A]">MAS Guidelines</div>
                <p className="mt-1 text-sm text-[#666] leading-relaxed">
                  Aligned with Monetary Authority of Singapore conduct guidelines
                  for outbound contact in regulated sectors.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-10 text-center text-sm text-[#999] max-w-2xl mx-auto">
          All campaigns are automatically checked against national do-not-call
          registries before dialling.
        </p>
      </div>
    </section>
  );
}
