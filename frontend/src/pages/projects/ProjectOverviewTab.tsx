import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useProgress, useRecalculateProgress } from "@/hooks/useProgress";
import { useProjectDashboard } from "@/hooks/useDashboard";
import { useGantt } from "@/hooks/useTasks";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Button } from "@/components/common/Button";
import { KpiTiles } from "@/components/dashboard/KpiTiles";
import { SCurveChart } from "@/components/scurve/SCurveChart";
import { OverdueTasksList } from "@/components/dashboard/OverdueTasksList";
import { UpcomingMilestonesList } from "@/components/dashboard/UpcomingMilestonesList";
import { DonutChart } from "@/components/reports/DonutChart";
import { chartColors } from "@/styles/chartColors";
import type { TaskPriority, TaskStatus } from "@/types/api";

const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Done",
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  not_started: chartColors.blueSoft,
  in_progress: chartColors.blue,
  blocked: chartColors.red,
  completed: chartColors.green,
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: chartColors.textSub,
  medium: chartColors.blue,
  high: chartColors.orange,
  critical: chartColors.red,
};

export function ProjectOverviewTab() {
  const { project } = useProjectDetailContext();
  const { data: progress, isLoading: progressLoading, error: progressError } = useProgress(
    project.id,
  );
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } =
    useProjectDashboard(project.id);
  const { data: gantt } = useGantt(project.id);
  const recalculate = useRecalculateProgress(project.id);

  const loading = progressLoading || dashboardLoading;

  const statusData = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      not_started: 0,
      in_progress: 0,
      blocked: 0,
      completed: 0,
    };
    for (const task of gantt?.tasks ?? []) counts[task.status]++;
    return (Object.keys(counts) as TaskStatus[]).map((status) => ({
      label: STATUS_LABEL[status],
      value: counts[status],
      color: STATUS_COLOR[status],
    }));
  }, [gantt]);

  const priorityData = useMemo(() => {
    const counts: Record<TaskPriority, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const task of gantt?.tasks ?? []) counts[task.priority]++;
    return (Object.keys(counts) as TaskPriority[]).map((priority) => ({
      label: PRIORITY_LABEL[priority],
      value: counts[priority],
      color: PRIORITY_COLOR[priority],
    }));
  }, [gantt]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-jira-textSub">
          Status as of {progress?.status_date ?? "—"}
        </h2>
        <Button
          variant="secondary"
          iconLeft={RefreshCw}
          onClick={() => recalculate.mutate()}
          loading={recalculate.isPending}
        >
          {recalculate.isPending ? "Recalculating…" : "Recalculate now"}
        </Button>
      </div>

      {loading && <LoadingSpinner />}
      <ErrorMessage error={progressError ?? dashboardError} />

      {progress && dashboard && (
        <>
          <KpiTiles metrics={progress.current} percentComplete={dashboard.percent_complete} />
          <SCurveChart points={progress.s_curve} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <OverdueTasksList tasks={dashboard.overdue_tasks} />
            <UpcomingMilestonesList milestones={dashboard.upcoming_milestones} />
          </div>
          {gantt && gantt.tasks.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DonutChart title="Tasks by status" data={statusData} />
              <DonutChart title="Tasks by priority" data={priorityData} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
