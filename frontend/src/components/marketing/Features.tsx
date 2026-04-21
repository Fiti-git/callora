import { Decorations } from "./Decorations";

const FEATURES = [
  {
    title: "AI Lead Discovery",
    description: "Find verified businesses by category and location automatically.",
  },
  {
    title: "Gemini Qualification",
    description: "Every prospect scored before a single call is made.",
  },
  {
    title: "Outbound AI Calling",
    description: "Branded voice agents handle conversations end-to-end.",
  },
  {
    title: "CSV Import",
    description: "Bring your own list with automatic phone normalisation.",
  },
  {
    title: "DNCL Compliance",
    description: "All campaigns scrub against national do-not-call registries.",
  },
  {
    title: "Real-Time Analytics",
    description: "Track outcomes, costs and pipeline as calls happen.",
  },
];

const BAR_HEIGHTS = [38, 62, 48, 80, 58, 70, 44];
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function Features() {
  return (
    <section id="features-detail" className="bg-white py-24 relative overflow-hidden">
      <Decorations variant="default" />
      <div className="relative z-10 max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-start">
        <div>
          <span className="border border-[#E0E0E0] text-[#666] text-xs font-medium px-3 py-1 rounded-full inline-block mb-6">
            FEATURES
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] tracking-tight leading-tight">
            Built for serious sales operations.
          </h2>

          <div className="mt-10 grid sm:grid-cols-2 gap-x-8 gap-y-7">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <div className="text-base font-bold text-[#1A1A1A]">
                  {f.title}
                </div>
                <p className="mt-1 text-sm text-[#666] leading-relaxed">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#1A1A1A] rounded-2xl p-8 text-white">
          <div className="grid grid-cols-3 gap-6 pb-6 border-b border-white/10">
            <Stat value="340" label="Calls" />
            <Stat value="67" label="Qualified" />
            <Stat value="$41.2k" label="Pipeline" />
          </div>

          <div className="pt-8">
            <div className="flex items-baseline justify-between mb-4">
              <div className="text-sm font-semibold">Calls this week</div>
              <div className="text-xs text-white/50">+18% WoW</div>
            </div>
            <div className="h-44 flex items-end gap-3">
              {BAR_HEIGHTS.map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full bg-[#DC0014] rounded-md transition-all"
                    style={{ height: `${h}%` }}
                  />
                  <div className="text-[10px] text-white/40 font-mono">
                    {DAYS[i]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-white/50 mt-1">{label}</div>
    </div>
  );
}
