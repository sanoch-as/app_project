import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { CalendarClock, Target, TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useProgressHistory, useProjectedProgress } from "@/hooks/useProgress";
import { useDateFormat } from "@/hooks/useDateFormat";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Card } from "@/components/common/Card";
import { DataTable } from "@/components/common/DataTable";
import { TaskStatusBadge } from "@/components/common/Badge";
import { PercentCompleteChart } from "@/components/scurve/PercentCompleteChart";
import type { TaskPlannedProgressRead } from "@/types/api";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function ProgressKpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Target;
  tone: "neutral" | "good" | "bad";
}) {
  const toneClasses =
    tone === "good"
      ? { bg: "bg-jira-greenBadgeBg", text: "text-jira-greenBadgeText" }
      : tone === "bad"
        ? { bg: "bg-red-50", text: "text-jira-red" }
        : { bg: "bg-jira-blueBadgeBg", text: "text-jira-blueBadgeText" };
  return (
    <Card>
      <Card.Body className="flex items-center gap-4">
        <span className={clsx("flex h-11 w-11 shrink-0 items-center justify-center rounded-md", toneClasses.bg)}>
          <Icon className={clsx("h-5 w-5", toneClasses.text)} aria-hidden="true" />
        </span>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-jira-textSub">{label}</div>
          <div className={clsx("mt-0.5 text-2xl font-bold", toneClasses.text)}>{value}</div>
        </div>
      </Card.Body>
    </Card>
  );
}

export function ProjectForecastTab() {
  const { t } = useTranslation();
  const formatDate = useDateFormat();
  const { project } = useProjectDetailContext();
  const [statusDate, setStatusDate] = useState(today());
  const [sorting, setSorting] = useState<SortingState>([{ id: "wbs_code", desc: false }]);

  const { data, isLoading, error } = useProjectedProgress(project.id, statusDate);

  const [historyStart, setHistoryStart] = useState(project.start_date ?? today());
  const [historyEnd, setHistoryEnd] = useState(project.end_date ?? addDays(today(), 84));
  const [intervalDays, setIntervalDays] = useState(7);

  const INTERVAL_OPTIONS = [
    { value: 7, label: t("forecast.weekly") },
    { value: 15, label: t("forecast.biweekly") },
    { value: 30, label: t("forecast.monthly") },
  ];

  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = useProgressHistory(project.id, historyStart, historyEnd, intervalDays);

  const columns = useMemo<ColumnDef<TaskPlannedProgressRead>[]>(
    () => [
      {
        accessorKey: "wbs_code",
        header: t("forecast.key"),
        cell: ({ row }) => (
          <span className="rounded bg-jira-blueBadgeBg px-1.5 py-0.5 font-mono text-xs font-semibold text-jira-blueBadgeText">
            {row.original.wbs_code}
          </span>
        ),
      },
      { accessorKey: "name", header: t("common.name") },
      {
        accessorKey: "status",
        header: t("common.status"),
        cell: ({ row }) => <TaskStatusBadge status={row.original.status} />,
      },
      {
        id: "planned_window",
        header: t("forecast.baselineWindow"),
        cell: ({ row }) =>
          row.original.planned_start_date
            ? `${formatDate(row.original.planned_start_date)} → ${formatDate(row.original.planned_end_date)}`
            : "—",
      },
      {
        accessorKey: "planned_percent_complete",
        header: t("forecast.plannedPercent"),
        cell: ({ row }) => `${row.original.planned_percent_complete.toFixed(0)}%`,
      },
      {
        accessorKey: "actual_percent_complete",
        header: t("forecast.actualPercent"),
        cell: ({ row }) => `${row.original.actual_percent_complete.toFixed(0)}%`,
      },
      {
        id: "delta",
        header: t("forecast.delta"),
        cell: ({ row }) => {
          const delta = row.original.actual_percent_complete - row.original.planned_percent_complete;
          const rounded = Math.round(delta);
          return (
            <span
              className={clsx(
                "font-medium",
                rounded > 0 ? "text-jira-greenBadgeText" : rounded < 0 ? "text-jira-red" : "text-jira-textSub",
              )}
            >
              {rounded > 0 ? "+" : ""}
              {rounded}%
            </span>
          );
        },
      },
    ],
    [t, formatDate],
  );

  const table = useReactTable({
    data: data?.tasks ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-jira-text">{t("forecast.title")}</h2>
          <p className="mt-1 max-w-xl text-sm text-jira-textSub">{t("forecast.subtitle")}</p>
        </div>
        <div>
          <label className="label" htmlFor="status_date">
            {t("forecast.statusDate")}
          </label>
          <input
            id="status_date"
            type="date"
            className="input"
            value={statusDate}
            onChange={(e) => setStatusDate(e.target.value)}
          />
        </div>
      </div>

      {isLoading && <LoadingSpinner label={t("forecast.calculating")} />}
      <ErrorMessage error={error} />

      {data && data.baseline_id === null && (
        <Card>
          <Card.Body className="flex items-center justify-between gap-4">
            <p className="text-sm text-jira-textSub">
              {t("forecast.noBaseline")}{" "}
              <Link to={`/projects/${project.id}/baselines`} className="font-medium text-brand-600 hover:underline">
                {t("forecast.saveOneInBaselines")}
              </Link>
              {t("forecast.thenComeBack")}
            </p>
          </Card.Body>
        </Card>
      )}

      {data && data.baseline_id !== null && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ProgressKpi
              label={t("forecast.plannedAsOf", { date: statusDate })}
              value={
                data.project_planned_percent_complete !== null
                  ? `${data.project_planned_percent_complete.toFixed(1)}%`
                  : t("forecast.notAvailable")
              }
              icon={CalendarClock}
              tone="neutral"
            />
            <ProgressKpi
              label={t("forecast.actualToday")}
              value={`${data.project_actual_percent_complete.toFixed(1)}%`}
              icon={
                data.project_planned_percent_complete !== null &&
                data.project_actual_percent_complete < data.project_planned_percent_complete
                  ? TrendingDown
                  : TrendingUp
              }
              tone={
                data.project_planned_percent_complete === null
                  ? "neutral"
                  : data.project_actual_percent_complete >= data.project_planned_percent_complete
                    ? "good"
                    : "bad"
              }
            />
          </div>
          {data.project_planned_percent_complete === null && (
            <p className="text-xs text-jira-textSub">{t("forecast.noCostData")}</p>
          )}
          {data.baseline_name && (
            <p className="text-xs text-jira-textSub">{t("forecast.baseline", { name: data.baseline_name })}</p>
          )}
          <DataTable table={table} emptyMessage={t("forecast.noTasksInProject")} />

          <div className="border-t border-jira-border pt-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-jira-text">{t("forecast.progressOverTime")}</h2>
                <p className="mt-1 max-w-xl text-sm text-jira-textSub">{t("forecast.realLineHint")}</p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label" htmlFor="history_start">
                    {t("forecast.from")}
                  </label>
                  <input
                    id="history_start"
                    type="date"
                    className="input"
                    value={historyStart}
                    onChange={(e) => setHistoryStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="history_end">
                    {t("forecast.to")}
                  </label>
                  <input
                    id="history_end"
                    type="date"
                    className="input"
                    value={historyEnd}
                    onChange={(e) => setHistoryEnd(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="history_interval">
                    {t("forecast.interval")}
                  </label>
                  <select
                    id="history_interval"
                    className="input"
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(Number(e.target.value))}
                  >
                    {INTERVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {historyLoading && <LoadingSpinner label={t("forecast.buildingChart")} />}
            <ErrorMessage error={historyError} />
            {history && <PercentCompleteChart points={history.points} />}
          </div>
        </>
      )}
    </div>
  );
}
