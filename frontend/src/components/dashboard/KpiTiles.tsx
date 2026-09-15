import type { LucideIcon } from "lucide-react";
import { CircleCheck, Gauge, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { EVMMetricsRead } from "@/types/api";

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type Tone = "good" | "bad" | "neutral";

const toneStyles: Record<Tone, { text: string; iconBg: string; iconText: string }> = {
  good: { text: "text-jira-greenBadgeText", iconBg: "bg-jira-greenBadgeBg", iconText: "text-jira-greenBadgeText" },
  bad: { text: "text-jira-red", iconBg: "bg-red-50", iconText: "text-jira-red" },
  neutral: { text: "text-jira-text", iconBg: "bg-jira-blueBadgeBg", iconText: "text-jira-blueBadgeText" },
};

function Tile({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  icon: LucideIcon;
}) {
  const styles = toneStyles[tone];
  return (
    <div className="card flex items-start gap-3 p-4">
      <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", styles.iconBg)}>
        <Icon className={clsx("h-4 w-4", styles.iconText)} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-jira-textSub">{label}</div>
        <div className={clsx("mt-0.5 text-xl font-bold leading-tight", styles.text)}>{value}</div>
        {hint && <div className="mt-0.5 truncate text-xs text-jira-textSub">{hint}</div>}
      </div>
    </div>
  );
}

function indexTone(value: number | null): Tone {
  if (value === null) return "neutral";
  return value >= 1 ? "good" : "bad";
}

export function KpiTiles({
  metrics,
  percentComplete,
}: {
  metrics: EVMMetricsRead;
  percentComplete?: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {percentComplete !== undefined && (
        <Tile
          label={t("dashboard.percentComplete")}
          value={`${percentComplete.toFixed(1)}%`}
          icon={CircleCheck}
          tone="neutral"
        />
      )}
      <Tile label={t("dashboard.plannedValue")} value={currencyFormatter.format(metrics.pv)} icon={Wallet} />
      <Tile label={t("dashboard.earnedValue")} value={currencyFormatter.format(metrics.ev)} icon={PiggyBank} />
      <Tile label={t("dashboard.actualCost")} value={currencyFormatter.format(metrics.ac)} icon={Wallet} />
      <Tile
        label="SPI"
        value={metrics.spi === null ? t("common.notApplicable") : metrics.spi.toFixed(2)}
        hint={t("dashboard.schedulePerformanceIndex")}
        tone={indexTone(metrics.spi)}
        icon={indexTone(metrics.spi) === "bad" ? TrendingDown : TrendingUp}
      />
      <Tile
        label="CPI"
        value={metrics.cpi === null ? t("common.notApplicable") : metrics.cpi.toFixed(2)}
        hint={t("dashboard.costPerformanceIndex")}
        tone={indexTone(metrics.cpi)}
        icon={Gauge}
      />
    </div>
  );
}
