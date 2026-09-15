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
import type { SCurvePointRead } from "@/types/api";
import { chartColors } from "@/styles/chartColors";

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function SCurveChart({ points }: { points: SCurvePointRead[] }) {
  if (points.length === 0) {
    return (
      <div className="card flex h-72 items-center justify-center text-sm text-jira-textSub">
        No S-curve data yet — save a baseline to establish planned value (PV).
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-semibold text-jira-text">
        S-Curve — Planned vs. Earned vs. Actual
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={points} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
          <XAxis dataKey="week_ending" tick={{ fontSize: 11, fill: chartColors.textSub }} />
          <YAxis
            tick={{ fontSize: 11, fill: chartColors.textSub }}
            tickFormatter={(v: number) => currencyFormatter.format(v)}
            width={80}
          />
          <Tooltip
            formatter={(value: number, name: string) => [currencyFormatter.format(value), name]}
          />
          <Legend />
          <Line type="monotone" dataKey="pv" name="Planned Value (PV)" stroke={chartColors.blue} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="ev" name="Earned Value (EV)" stroke={chartColors.green} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="ac" name="Actual Cost (AC)" stroke={chartColors.red} dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
