import { useMemo, useState } from "react";
import { Diamond, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDateFormat } from "@/hooks/useDateFormat";
import { useRoadmapPreferences, type RoadmapScale } from "@/hooks/useRoadmapPreferences";
import { useUpdateTask } from "@/hooks/useTasks";
import { Button } from "@/components/common/Button";
import { RoadmapTaskPickerModal } from "@/pages/projects/RoadmapTaskPickerModal";
import { JIRA_PROJECT_ROOT_KEY } from "@/lib/jiraImport";
import { chartColors } from "@/styles/chartColors";
import {
  buildChildrenIndex,
  buildColumns,
  collectDescendantMilestones,
  computeOverallRange,
  computeRoadmapDepths,
  currentColumnPosition,
  dateRangeToBarStyle,
  dateToColumnFraction,
  derivePhaseColorState,
  parseIsoDateLocal,
  suggestDefaultOnTimelineIds,
  toIsoDateLocal,
  todayLocal,
  totalWeeksSpanned,
  type PhaseColorState,
} from "@/lib/roadmap";
import type { ProjectRead, TaskRead } from "@/types/api";

interface ProjectRoadmapProps {
  project: ProjectRead;
  tasks: TaskRead[];
}

const PHASE_COLOR: Record<PhaseColorState, string> = {
  pending: chartColors.border,
  in_progress: chartColors.orange,
  completed: chartColors.green,
};

const SCALES: RoadmapScale[] = ["weekly", "biweekly", "monthly"];
const SCALE_KEY: Record<RoadmapScale, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
};

// The label column's own width (Tailwind `w-48`) plus the row's `gap-2` —
// every row (header, today-line overlay, each phase) uses this exact same
// flex shape so their "timeline" halves share one coordinate space and a
// bar/column/today-line drawn at the same fraction lines up across all of
// them (see ADR-041).
const LABEL_COLUMN_CLASS = "w-48 shrink-0";
const INDENT_STEP_PX = 14;

export function ProjectRoadmap({ project, tasks }: ProjectRoadmapProps) {
  const { t } = useTranslation();
  const formatDate = useDateFormat();
  const updateTask = useUpdateTask(project.id);
  const { scale, showMilestones, showToday, setScale, setShowMilestones, setShowToday } =
    useRoadmapPreferences(project.id);
  const [showPicker, setShowPicker] = useState(false);
  const [applyingDefault, setApplyingDefault] = useState(false);

  const onTimelineTasks = useMemo(() => tasks.filter((task) => task.on_timeline), [tasks]);
  const onTimelineIds = useMemo(
    () => new Set(onTimelineTasks.map((task) => task.id)),
    [onTimelineTasks],
  );
  const depths = useMemo(
    () => computeRoadmapDepths(tasks, onTimelineIds),
    [tasks, onTimelineIds],
  );
  const childrenIndex = useMemo(() => buildChildrenIndex(tasks), [tasks]);
  const range = useMemo(
    () => computeOverallRange(onTimelineTasks, project),
    [onTimelineTasks, project],
  );
  const columns = useMemo(() => (range ? buildColumns(range, scale) : []), [range, scale]);
  const today = useMemo(() => todayLocal(), []);
  const { current, total } = useMemo(() => currentColumnPosition(columns, today), [columns, today]);
  const todayLeftPercent = columns.length > 0 ? dateToColumnFraction(today, columns) * 100 : 0;
  const defaultIds = useMemo(
    () => suggestDefaultOnTimelineIds(tasks, JIRA_PROJECT_ROOT_KEY),
    [tasks],
  );

  const hasTimeline = onTimelineTasks.length > 0;
  const titleKey =
    scale === "weekly" ? "titleWeekly" : scale === "biweekly" ? "titleBiweekly" : "titleMonthly";
  const columnPrefixKey =
    scale === "weekly"
      ? "columnPrefixWeekly"
      : scale === "biweekly"
        ? "columnPrefixBiweekly"
        : "columnPrefixMonthly";
  const columnPrefix = t(`projects.overview.roadmap.${columnPrefixKey}`);

  async function applyDefaultSelection() {
    if (defaultIds.length === 0) return;
    setApplyingDefault(true);
    try {
      await Promise.all(
        defaultIds.map((taskId) =>
          updateTask.mutateAsync({ taskId, payload: { on_timeline: true } }),
        ),
      );
    } finally {
      setApplyingDefault(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-jira-orange">
            {t("projects.overview.roadmap.eyebrow")}
          </p>
          <h2 className="text-lg font-semibold text-jira-text">
            {hasTimeline
              ? t(`projects.overview.roadmap.${titleKey}`, { current, total })
              : t("projects.overview.roadmap.emptyTitle")}
          </h2>
        </div>
        {hasTimeline && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-md border border-jira-border p-0.5">
              {SCALES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScale(s)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    scale === s
                      ? "bg-brand-600 text-white"
                      : "text-jira-textSub hover:bg-jira-hover"
                  }`}
                >
                  {t(`projects.overview.roadmap.scale${SCALE_KEY[s]}`)}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-jira-textSub">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={showMilestones}
                onChange={(e) => setShowMilestones(e.target.checked)}
              />
              {t("projects.overview.roadmap.showMilestones")}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-jira-textSub">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={showToday}
                onChange={(e) => setShowToday(e.target.checked)}
              />
              {t("projects.overview.roadmap.showToday")}
            </label>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={ListChecks}
              onClick={() => setShowPicker(true)}
            >
              {t("projects.overview.roadmap.manageButton")}
            </Button>
          </div>
        )}
      </div>

      {!hasTimeline ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-jira-textSub">
            {tasks.length === 0
              ? t("projects.overview.roadmap.emptyNoTasks")
              : t("projects.overview.roadmap.emptyBody")}
          </p>
          {tasks.length > 0 && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowPicker(true)}>
                {t("projects.overview.roadmap.emptyPickButton")}
              </Button>
              {defaultIds.length > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  loading={applyingDefault}
                  onClick={applyDefaultSelection}
                >
                  {t("projects.overview.roadmap.emptyDefaultButton")}
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        range && (
          <>
            <div className="relative">
              {/* Today-line overlay: same flex shape (label spacer + flex-1
                  timeline) as every row below, so its `left: X%` shares the
                  exact same coordinate space as the header columns and the
                  bars — absolutely positioned over the whole stack so it
                  still spans the full height. */}
              {showToday && (
                <div className="pointer-events-none absolute inset-0 z-10 flex gap-2">
                  <div className={LABEL_COLUMN_CLASS} />
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0" style={{ left: `${todayLeftPercent}%` }}>
                      <div className="absolute -top-6 -translate-x-1/2 whitespace-nowrap rounded bg-brand-800 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {t("projects.overview.roadmap.today")}
                      </div>
                      <div className="absolute top-0 h-full border-l-2 border-dashed border-brand-800" />
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-1 flex items-center gap-2">
                <div className={LABEL_COLUMN_CLASS} />
                <div
                  className="grid flex-1"
                  style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
                >
                  {columns.map((col, i) => (
                    <div
                      key={`${col.label}-${i}`}
                      className="border-b border-jira-borderSoft pb-1 text-center text-[11px] text-jira-textSub"
                    >
                      {columnPrefix}
                      {col.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 pt-3">
                {onTimelineTasks.map((task) => {
                  const bar = dateRangeToBarStyle(task.start_date, task.end_date, columns);
                  const colorState = derivePhaseColorState(task.percent_complete);
                  const milestones = showMilestones
                    ? collectDescendantMilestones(childrenIndex, task.id)
                    : [];
                  const indent = (depths.get(task.id) ?? 0) * INDENT_STEP_PX;
                  return (
                    <div key={task.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className={`${LABEL_COLUMN_CLASS} truncate text-sm text-jira-text`}
                          style={{ paddingLeft: indent }}
                          title={task.name}
                        >
                          {task.name}
                        </span>
                        <div className="relative h-5 flex-1 rounded bg-jira-panel">
                          <div
                            className="absolute inset-y-0 rounded"
                            style={{
                              left: `${bar.leftPercent}%`,
                              width: `${bar.widthPercent}%`,
                              backgroundColor: PHASE_COLOR[colorState],
                            }}
                            title={`${task.name} — ${formatDate(task.start_date)} → ${formatDate(task.end_date)}`}
                          />
                        </div>
                      </div>
                      {milestones.length > 0 && (
                        <div className="flex gap-2">
                          <div className={LABEL_COLUMN_CLASS} />
                          <div className="relative h-11 flex-1">
                            {milestones.map((milestone, i) => {
                              const left =
                                dateToColumnFraction(
                                  parseIsoDateLocal(milestone.start_date),
                                  columns,
                                ) * 100;
                              return (
                                <div
                                  key={milestone.id}
                                  className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                                  style={{ left: `${left}%`, marginTop: i % 2 === 0 ? 0 : 24 }}
                                >
                                  <Diamond
                                    className="h-3 w-3 shrink-0 fill-jira-orange text-jira-orange"
                                    aria-hidden="true"
                                  />
                                  <span
                                    className="max-w-[8rem] truncate text-[10px] text-jira-text"
                                    title={`${milestone.name} — ${formatDate(milestone.start_date)}`}
                                  >
                                    {milestone.name}
                                  </span>
                                  <span className="whitespace-nowrap text-[9px] text-jira-textSub">
                                    {formatDate(milestone.start_date)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-jira-textSub">
              <LegendDot color={PHASE_COLOR.completed} label={t("projects.overview.roadmap.legendCompleted")} />
              <LegendDot
                color={PHASE_COLOR.in_progress}
                label={t("projects.overview.roadmap.legendInProgress")}
              />
              <LegendDot color={PHASE_COLOR.pending} label={t("projects.overview.roadmap.legendPending")} />
              {showToday && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0 w-3 border-t-2 border-dashed border-brand-800" />
                  {t("projects.overview.roadmap.today")}
                </span>
              )}
            </div>

            <p className="mt-3 border-t border-jira-borderSoft pt-2 text-xs text-jira-textSub">
              {t("projects.overview.roadmap.footer", {
                weeks: totalWeeksSpanned(range),
                start: formatDate(toIsoDateLocal(range.start)),
                end: formatDate(toIsoDateLocal(range.end)),
              })}
            </p>
          </>
        )
      )}

      {showPicker && (
        <RoadmapTaskPickerModal
          projectId={project.id}
          tasks={tasks}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
