import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useProgress, useRecalculateProgress } from "@/hooks/useProgress";
import { useProjectDashboard } from "@/hooks/useDashboard";
import { useGantt } from "@/hooks/useTasks";
import { useDateFormat } from "@/hooks/useDateFormat";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Button } from "@/components/common/Button";
import { KpiTiles } from "@/components/dashboard/KpiTiles";
import { SCurveChart } from "@/components/scurve/SCurveChart";
import { OverdueTasksList } from "@/components/dashboard/OverdueTasksList";
import { UpcomingMilestonesList } from "@/components/dashboard/UpcomingMilestonesList";
import { DonutChart } from "@/components/reports/DonutChart";
import { ProjectRoadmap } from "@/pages/projects/ProjectRoadmap";
import { chartColors } from "@/styles/chartColors";
import type { TaskPriority, TaskStatus } from "@/types/api";

const STATUS_COLOR: Record<TaskStatus, string> = {
  not_started: chartColors.blueSoft,
  in_progress: chartColors.blue,
  blocked: chartColors.red,
  completed: chartColors.green,
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: chartColors.textSub,
  medium: chartColors.blue,
  high: chartColors.orange,
  critical: chartColors.red,
};

export function ProjectOverviewTab() {
  const { t } = useTranslation();
  const formatDate = useDateFormat();
  const { project } = useProjectDetailContext();
  const { data: progress, isLoading: progressLoading, error: progressError } = useProgress(
    project.id,
  );
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } =
    useProjectDashboard(project.id);
  const { data: gantt } = useGantt(project.id);
  const recalculate = useRecalculateProgress(project.id);

  const loading = progressLoading || dashboardLoading;

  const statusLabel: Record<TaskStatus, string> = {
    not_started: t("projects.overview.statusToDo"),
    in_progress: t("enums.taskStatus.in_progress"),
    blocked: t("enums.taskStatus.blocked"),
    completed: t("projects.overview.statusDone"),
  };

  const priorityLabel: Record<TaskPriority, string> = {
    low: t("enums.taskPriority.low"),
    medium: t("enums.taskPriority.medium"),
    high: t("enums.taskPriority.high"),
    critical: t("enums.taskPriority.critical"),
  };

  const statusData = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      not_started: 0,
      in_progress: 0,
      blocked: 0,
      completed: 0,
    };
    for (const task of gantt?.tasks ?? []) counts[task.status]++;
    return (Object.keys(counts) as TaskStatus[]).map((status) => ({
      label: statusLabel[status],
      value: counts[status],
      color: STATUS_COLOR[status],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gantt, t]);

  const priorityData = useMemo(() => {
    const counts: Record<TaskPriority, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const task of gantt?.tasks ?? []) counts[task.priority]++;
    return (Object.keys(counts) as TaskPriority[]).map((priority) => ({
      label: priorityLabel[priority],
      value: counts[priority],
      color: PRIORITY_COLOR[priority],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gantt, t]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-jira-textSub">
          {t("projects.overview.statusAsOf", { date: formatDate(progress?.status_date) })}
        </h2>
        <Button
          variant="secondary"
          iconLeft={RefreshCw}
          onClick={() => recalculate.mutate()}
          loading={recalculate.isPending}
        >
          {recalculate.isPending
            ? t("projects.overview.recalculating")
            : t("projects.overview.recalculateNow")}
        </Button>
      </div>

      {gantt && <ProjectRoadmap project={project} tasks={gantt.tasks} />}

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
              <DonutChart title={t("projects.overview.tasksByStatus")} data={statusData} />
              <DonutChart title={t("projects.overview.tasksByPriority")} data={priorityData} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
