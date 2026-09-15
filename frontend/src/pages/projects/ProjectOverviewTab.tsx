import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useProgress, useRecalculateProgress } from "@/hooks/useProgress";
import { useProjectDashboard } from "@/hooks/useDashboard";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { KpiTiles } from "@/components/dashboard/KpiTiles";
import { SCurveChart } from "@/components/scurve/SCurveChart";
import { OverdueTasksList } from "@/components/dashboard/OverdueTasksList";
import { UpcomingMilestonesList } from "@/components/dashboard/UpcomingMilestonesList";

export function ProjectOverviewTab() {
  const { project } = useProjectDetailContext();
  const { data: progress, isLoading: progressLoading, error: progressError } = useProgress(
    project.id,
  );
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } =
    useProjectDashboard(project.id);
  const recalculate = useRecalculateProgress(project.id);

  const loading = progressLoading || dashboardLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Status as of {progress?.status_date ?? "—"}
        </h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => recalculate.mutate()}
          disabled={recalculate.isPending}
        >
          {recalculate.isPending ? "Recalculating…" : "Recalculate now"}
        </button>
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
        </>
      )}
    </div>
  );
}
