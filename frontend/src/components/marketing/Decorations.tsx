type DecorationConfig = {
  className: string;
  style: React.CSSProperties;
};

type DecorationsProps = {
  variant?: "default" | "dense" | "sparse";
};

const PRESETS: Record<NonNullable<DecorationsProps["variant"]>, DecorationConfig[]> = {
  default: [
    { className: "w-40 h-40", style: { top: "8%", left: "6%", transform: "rotate(-12deg)" } },
    { className: "w-56 h-56", style: { top: "20%", right: "4%", transform: "rotate(18deg)" } },
    { className: "w-32 h-32", style: { top: "55%", left: "12%", transform: "rotate(24deg)" } },
    { className: "w-48 h-48", style: { bottom: "10%", right: "10%", transform: "rotate(-8deg)" } },
    { className: "w-36 h-36", style: { bottom: "20%", left: "40%", transform: "rotate(15deg)" } },
  ],
  dense: [
    { className: "w-40 h-40", style: { top: "4%", left: "10%", transform: "rotate(-15deg)" } },
    { className: "w-32 h-32", style: { top: "12%", right: "12%", transform: "rotate(22deg)" } },
    { className: "w-56 h-56", style: { top: "40%", left: "-4%", transform: "rotate(8deg)" } },
    { className: "w-44 h-44", style: { top: "50%", right: "6%", transform: "rotate(-20deg)" } },
    { className: "w-36 h-36", style: { bottom: "8%", left: "30%", transform: "rotate(12deg)" } },
    { className: "w-40 h-40", style: { bottom: "14%", right: "20%", transform: "rotate(-6deg)" } },
  ],
  sparse: [
    { className: "w-40 h-40", style: { top: "12%", left: "8%", transform: "rotate(-10deg)" } },
    { className: "w-48 h-48", style: { bottom: "12%", right: "8%", transform: "rotate(14deg)" } },
    { className: "w-32 h-32", style: { top: "55%", right: "30%", transform: "rotate(-22deg)" } },
    { className: "w-36 h-36", style: { bottom: "30%", left: "20%", transform: "rotate(20deg)" } },
  ],
};

export function Decorations({ variant = "default" }: DecorationsProps) {
  const items = PRESETS[variant];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {items.map((item, i) => (
        <div
          key={i}
          className={`absolute rounded-lg bg-[#DC0014]/5 ${item.className}`}
          style={item.style}
        />
      ))}
    </div>
  );
}
