import type { EVMMetricsRead } from "@/types/api";

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-green-700"
      : tone === "bad"
        ? "text-red-700"
        : "text-slate-900";
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function indexTone(value: number | null): "good" | "bad" | "neutral" {
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
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {percentComplete !== undefined && (
        <Tile label="% Complete" value={`${percentComplete.toFixed(1)}%`} />
      )}
      <Tile label="Planned Value" value={currencyFormatter.format(metrics.pv)} />
      <Tile label="Earned Value" value={currencyFormatter.format(metrics.ev)} />
      <Tile label="Actual Cost" value={currencyFormatter.format(metrics.ac)} />
      <Tile
        label="SPI"
        value={metrics.spi === null ? "n/a" : metrics.spi.toFixed(2)}
        hint="Schedule Performance Index"
        tone={indexTone(metrics.spi)}
      />
      <Tile
        label="CPI"
        value={metrics.cpi === null ? "n/a" : metrics.cpi.toFixed(2)}
        hint="Cost Performance Index"
        tone={indexTone(metrics.cpi)}
      />
    </div>
  );
}
