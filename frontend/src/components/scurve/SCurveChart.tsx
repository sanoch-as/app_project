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

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function SCurveChart({ points }: { points: SCurvePointRead[] }) {
  if (points.length === 0) {
    return (
      <div className="card flex h-72 items-center justify-center text-sm text-slate-500">
        No S-curve data yet — save a baseline to establish planned value (PV).
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">
        S-Curve — Planned vs. Earned vs. Actual
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={points} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="week_ending" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => currencyFormatter.format(v)}
            width={80}
          />
          <Tooltip
            formatter={(value: number, name: string) => [currencyFormatter.format(value), name]}
          />
          <Legend />
          <Line type="monotone" dataKey="pv" name="Planned Value (PV)" stroke="#2563eb" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="ev" name="Earned Value (EV)" stroke="#16a34a" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="ac" name="Actual Cost (AC)" stroke="#dc2626" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
