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
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useProgressHistory, useProjectedProgress } from "@/hooks/useProgress";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Card } from "@/components/common/Card";
import { DataTable } from "@/components/common/DataTable";
import { TaskStatusBadge } from "@/components/common/Badge";
import { PercentCompleteChart } from "@/components/scurve/PercentCompleteChart";
import type { TaskPlannedProgressRead } from "@/types/api";

const INTERVAL_OPTIONS = [
  { value: 7, label: "Weekly" },
  { value: 15, label: "Biweekly" },
  { value: 30, label: "Monthly" },
];

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
  const { project } = useProjectDetailContext();
  const [statusDate, setStatusDate] = useState(today());
  const [sorting, setSorting] = useState<SortingState>([{ id: "wbs_code", desc: false }]);

  const { data, isLoading, error } = useProjectedProgress(project.id, statusDate);

  const [historyStart, setHistoryStart] = useState(project.start_date ?? today());
  const [historyEnd, setHistoryEnd] = useState(project.end_date ?? addDays(today(), 84));
  const [intervalDays, setIntervalDays] = useState(7);

  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = useProgressHistory(project.id, historyStart, historyEnd, intervalDays);

  const columns = useMemo<ColumnDef<TaskPlannedProgressRead>[]>(
    () => [
      {
        accessorKey: "wbs_code",
        header: "Key",
        cell: ({ row }) => (
          <span className="rounded bg-jira-blueBadgeBg px-1.5 py-0.5 font-mono text-xs font-semibold text-jira-blueBadgeText">
            {row.original.wbs_code}
          </span>
        ),
      },
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <TaskStatusBadge status={row.original.status} />,
      },
      {
        id: "planned_window",
        header: "Baseline window",
        cell: ({ row }) =>
          row.original.planned_start_date
            ? `${row.original.planned_start_date} → ${row.original.planned_end_date}`
            : "—",
      },
      {
        accessorKey: "planned_percent_complete",
        header: "Planned %",
        cell: ({ row }) => `${row.original.planned_percent_complete.toFixed(0)}%`,
      },
      {
        accessorKey: "actual_percent_complete",
        header: "Actual %",
        cell: ({ row }) => `${row.original.actual_percent_complete.toFixed(0)}%`,
      },
      {
        id: "delta",
        header: "Delta",
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
    [],
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
          <h2 className="text-sm font-semibold text-jira-text">Baseline forecast</h2>
          <p className="mt-1 max-w-xl text-sm text-jira-textSub">
            Pick a date to see what % complete each task — and the project overall — should be
            at that date according to the saved baseline plan. "Actual %" always reflects each
            task's current progress, not a historical value.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="status_date">
            Status date
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

      {isLoading && <LoadingSpinner label="Calculating projection…" />}
      <ErrorMessage error={error} />

      {data && data.project_planned_percent_complete === null && (
        <Card>
          <Card.Body className="flex items-center justify-between gap-4">
            <p className="text-sm text-jira-textSub">
              No baseline saved yet — there's no plan to project against.{" "}
              <Link to={`/projects/${project.id}/baselines`} className="font-medium text-brand-600 hover:underline">
                Save one in the Baselines tab
              </Link>
              , then come back here.
            </p>
          </Card.Body>
        </Card>
      )}

      {data && data.project_planned_percent_complete !== null && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ProgressKpi
              label={`Planned as of ${statusDate}`}
              value={`${data.project_planned_percent_complete.toFixed(1)}%`}
              icon={CalendarClock}
              tone="neutral"
            />
            <ProgressKpi
              label="Actual today"
              value={`${data.project_actual_percent_complete.toFixed(1)}%`}
              icon={data.project_actual_percent_complete >= data.project_planned_percent_complete ? TrendingUp : TrendingDown}
              tone={data.project_actual_percent_complete >= data.project_planned_percent_complete ? "good" : "bad"}
            />
          </div>
          {data.baseline_name && (
            <p className="text-xs text-jira-textSub">Baseline: {data.baseline_name}</p>
          )}
          <DataTable table={table} emptyMessage="No tasks in this project yet." />

          <div className="border-t border-jira-border pt-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-jira-text">Progress over time</h2>
                <p className="mt-1 max-w-xl text-sm text-jira-textSub">
                  The "Real %" line only covers dates with recorded history (captured daily going
                  forward from when this feature shipped) and does not extend past today.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label" htmlFor="history_start">
                    From
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
                    To
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
                    Interval
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

            {historyLoading && <LoadingSpinner label="Building chart…" />}
            <ErrorMessage error={historyError} />
            {history && <PercentCompleteChart points={history.points} />}
          </div>
        </>
      )}
    </div>
  );
}
