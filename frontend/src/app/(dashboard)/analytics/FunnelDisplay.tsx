
"use client";

type Funnel = { total: number; called: number; qualified: number };

export function FunnelDisplay({ funnel }: { funnel: Funnel }) {
  const { total, called, qualified } = funnel;

  const stages = [
    { label: "Total Leads", value: total, pct: 100, color: "bg-blue-500" },
    {
      label: "Called",
      value: called,
      pct: total > 0 ? Math.round((called / total) * 100) : 0,
      color: "bg-amber-400",
    },
    {
      label: "Qualified",
      value: qualified,
      pct: total > 0 ? Math.round((qualified / total) * 100) : 0,
      color: "bg-green-500",
    },
  ];

  return (
    <div className="flex flex-col gap-3 py-2">
      {stages.map((stage) => (
        <div key={stage.label}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-gray-600">{stage.label}</span>
            <span className="text-xs text-gray-500">
              {stage.value.toLocaleString()} ({stage.pct}%)
            </span>
          </div>
          <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${stage.color} rounded-full transition-all duration-500`}
              style={{ width: `${Math.max(stage.pct, stage.value > 0 ? 2 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
