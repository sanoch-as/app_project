import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTranslation } from "react-i18next";
import { chartSeriesPalette } from "@/styles/chartColors";

export interface DonutDatum {
  label: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  title: string;
  data: DonutDatum[];
  size?: number;
}

export function DonutChart({ title, data, size = 150 }: DonutChartProps) {
  const { t } = useTranslation();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const nonEmpty = data.filter((d) => d.value > 0);

  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-jira-text">{title}</h3>
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        {nonEmpty.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-jira-textSub">
            {t("reports.noData")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={nonEmpty}
                dataKey="value"
                nameKey="label"
                innerRadius={size * 0.36}
                outerRadius={size * 0.5}
                paddingAngle={nonEmpty.length > 1 ? 2 : 0}
                startAngle={90}
                endAngle={-270}
              >
                {nonEmpty.map((d, i) => (
                  <Cell key={d.label} fill={d.color ?? chartSeriesPalette[i % chartSeriesPalette.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number, name: string) => [value, name]} />
            </PieChart>
          </ResponsiveContainer>
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-jira-text">{total}</span>
          <span className="text-xs text-jira-textSub">{t("reports.total")}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-3.5 gap-y-1.5">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-1.5 text-xs text-jira-text">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: d.color ?? chartSeriesPalette[i % chartSeriesPalette.length] }}
              aria-hidden="true"
            />
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
