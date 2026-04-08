"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type Breakdown = {
  transport: number;
  stt: number;
  llm: number;
  tts: number;
  vapi: number;
};

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

const LABELS: Record<string, string> = {
  transport: "Transport",
  stt: "STT",
  llm: "LLM",
  tts: "TTS",
  vapi: "Vapi",
};

export function CostBreakdownChart({ breakdown }: { breakdown: Breakdown }) {
  const data = Object.entries(breakdown).map(([key, value]) => ({
    name: LABELS[key] ?? key,
    cost: value,
  }));

  const hasData = data.some((d) => d.cost > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No cost breakdown data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v.toFixed(3)}`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
          }}
          formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]}
        />
        <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
