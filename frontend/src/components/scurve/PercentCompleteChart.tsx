import {
  CartesianGrid,
  LabelList,
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

export interface PercentCompleteChartPoint {
  checkpoint: string;
  planned: number | null;
  actual: number | null;
}

interface ChartRow {
  checkpoint: string;
  planned: number | null;
  actual: number | null;
}

interface ChartLabelContentProps {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  index?: number;
}

interface PercentCompleteChartProps {
  points: PercentCompleteChartPoint[];
  title: string;
}

function roundedEquals(a: number, b: number | null | undefined): boolean {
  return b !== null && b !== undefined && a.toFixed(1) === b.toFixed(1);
}

/** A point's value label is only drawn when it differs (at the displayed
 * 1-decimal precision) from the previous point's — a flat run (e.g. several
 * consecutive 100.0% checkpoints once a project finishes) would otherwise
 * stack identical text on top of itself. Position is still driven by the
 * parent <Line>'s own points; this only decides what text (if any) to draw
 * at each one. */
function makeDedupedLabel(rows: ChartRow[], seriesKey: "planned" | "actual", color: string, dy: number) {
  return function DedupedLabel({ x, y, value, index }: ChartLabelContentProps) {
    if (value === null || value === undefined || x === undefined || y === undefined) return null;
    if (typeof index !== "number") return null;
    const numeric = Number(value);
    const previous = index > 0 ? rows[index - 1][seriesKey] : undefined;
    if (roundedEquals(numeric, previous)) return null;
    return (
      <text
        x={Number(x)}
        y={Number(y) + dy}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fill={color}
      >
        {`${numeric.toFixed(1)}%`}
      </text>
    );
  };
}

/** Generic planned-vs-actual line chart — deliberately doesn't know about
 * cost vs. duration weighting (ADR-033): the caller picks which pair of
 * fields to read from the API response and passes an already-mapped
 * `{checkpoint, planned, actual}[]`, so this same component renders both
 * the Forecast tab's "Por costo" and "Por plazo" sections. */
export function PercentCompleteChart({ points, title }: PercentCompleteChartProps) {
  const { t, i18n } = useTranslation();
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" });

  if (points.length === 0) {
    return (
      <div className="card flex h-72 items-center justify-center text-sm text-jira-textSub">
        {t("forecast.noDataForRange")}
      </div>
    );
  }

  const data: ChartRow[] = points.map((p) => ({
    checkpoint: dateFormatter.format(new Date(`${p.checkpoint}T00:00:00`)),
    planned: p.planned,
    actual: p.actual,
  }));

  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-semibold text-jira-text">{title}</h3>
      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={data} margin={{ top: 36, right: 32, left: 8, bottom: 32 }}>
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
              value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}%`,
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
          >
            <LabelList
              dataKey="planned"
              content={makeDedupedLabel(data, "planned", chartColors.blueDark, -12)}
            />
          </Line>
          <Line
            type="monotone"
            dataKey="actual"
            name={t("forecast.actualSeries")}
            stroke={chartColors.orange}
            dot={{ r: 3 }}
            strokeWidth={2}
            connectNulls={false}
          >
            <LabelList
              dataKey="actual"
              content={makeDedupedLabel(data, "actual", chartColors.orange, 20)}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
