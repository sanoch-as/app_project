import {
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartColors } from "@/styles/chartColors";
import type { PercentCompleteSeriesPointRead } from "@/types/api";

const dateFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

function formatCheckpoint(checkpoint: string): string {
  return dateFormatter.format(new Date(`${checkpoint}T00:00:00`));
}

export function PercentCompleteChart({ points }: { points: PercentCompleteSeriesPointRead[] }) {
  if (points.length === 0) {
    return (
      <div className="card flex h-72 items-center justify-center text-sm text-jira-textSub">
        No data for this range yet.
      </div>
    );
  }

  const data = points.map((p) => ({
    checkpoint: formatCheckpoint(p.checkpoint),
    planned: p.planned_percent_complete,
    actual: p.actual_percent_complete,
  }));

  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-semibold text-jira-text">Planned vs. Real — % complete over time</h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
          <XAxis dataKey="checkpoint" tick={{ fontSize: 11, fill: chartColors.textSub }} />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: chartColors.textSub }}
            tickFormatter={(v: number) => `${v}%`}
            width={44}
          />
          <Tooltip
            formatter={(value, name) => [
              value === null || value === undefined ? "—" : `${Number(value).toFixed(0)}%`,
              name,
            ]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="planned"
            name="Planned %"
            stroke={chartColors.blueDark}
            dot={{ r: 3 }}
            strokeWidth={2}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Real %"
            stroke={chartColors.orange}
            dot={{ r: 3 }}
            strokeWidth={2}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
