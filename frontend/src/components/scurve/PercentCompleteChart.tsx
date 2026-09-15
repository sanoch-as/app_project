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
import { useTranslation } from "react-i18next";
import { chartColors } from "@/styles/chartColors";
import type { PercentCompleteSeriesPointRead } from "@/types/api";

export function PercentCompleteChart({ points }: { points: PercentCompleteSeriesPointRead[] }) {
  const { t, i18n } = useTranslation();
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" });

  if (points.length === 0) {
    return (
      <div className="card flex h-72 items-center justify-center text-sm text-jira-textSub">
        {t("forecast.noDataForRange")}
      </div>
    );
  }

  const data = points.map((p) => ({
    checkpoint: dateFormatter.format(new Date(`${p.checkpoint}T00:00:00`)),
    planned: p.planned_percent_complete,
    actual: p.actual_percent_complete,
  }));

  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-semibold text-jira-text">{t("forecast.chartTitle")}</h3>
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
            name={t("forecast.plannedSeries")}
            stroke={chartColors.blueDark}
            dot={{ r: 3 }}
            strokeWidth={2}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name={t("forecast.actualSeries")}
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
