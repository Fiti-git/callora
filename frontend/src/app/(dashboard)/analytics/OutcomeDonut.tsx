"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

type DataPoint = { status: string; count: number };

const COLOR_MAP: Record<string, string> = {
  COMPLETED: "#22c55e",
  NO_ANSWER: "#f59e0b",
  VOICEMAIL: "#3b82f6",
  FAILED: "#ef4444",
};

const DEFAULT_COLOR = "#94a3b8";

export function OutcomeDonut({ data }: { data: DataPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No call outcome data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="status"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell
              key={entry.status}
              fill={COLOR_MAP[entry.status] ?? DEFAULT_COLOR}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            fontSize: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
          }}
          formatter={(value, name) => [value, name]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: "#6b7280" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
