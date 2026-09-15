import { useEffect, useMemo, useRef, useState } from "react";
import Gantt, { type GanttTask, type GanttViewMode } from "frappe-gantt";
// frappe-gantt's package "main" (src/index.js) imports its own gantt.scss
// alongside the class export, so no separate stylesheet import is needed
// here — just our overrides layered on top (ADR-008/ADR-021).
import "@/components/gantt/gantt-overrides.css";
import type { DependencyRead, TaskRead } from "@/types/api";

interface GanttChartProps {
  tasks: TaskRead[];
  dependencies: DependencyRead[];
  /** Fired after a drag-and-drop date change; caller persists via PATCH /tasks/{id}. */
  onDateChange: (taskId: string, startDate: string, durationDays: number) => void;
  /** Fired when a bar is clicked; caller typically opens the edit form. */
  onTaskClick: (taskId: string) => void;
}

const VIEW_MODES: { value: GanttViewMode; label: string }[] = [
  { value: "Day", label: "Day" },
  { value: "Week", label: "Week" },
  { value: "Month", label: "Month" },
];

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inclusive whole-day span between two dates, minimum 1. */
function inclusiveDaySpan(start: Date, end: Date): number {
  const ms = end.setHours(0, 0, 0, 0) - new Date(start).setHours(0, 0, 0, 0);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export function GanttChart({ tasks, dependencies, onDateChange, onTaskClick }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<Gantt | null>(null);
  const [viewMode, setViewMode] = useState<GanttViewMode>("Week");

  // Latest-ref pattern: the Gantt instance is created once (or once per
  // empty->non-empty transition) and its option callbacks close over these
  // refs, so callers' onDateChange/onTaskClick can change identity every
  // render without forcing a full chart teardown/rebuild.
  const onDateChangeRef = useRef(onDateChange);
  onDateChangeRef.current = onDateChange;
  const onTaskClickRef = useRef(onTaskClick);
  onTaskClickRef.current = onTaskClick;

  const predecessorsByTask = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dep of dependencies) {
      const list = map.get(dep.successor_id) ?? [];
      list.push(dep.predecessor_id);
      map.set(dep.successor_id, list);
    }
    return map;
  }, [dependencies]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const ganttTasks = useMemo<GanttTask[]>(
    () =>
      tasks.map((task) => {
        const classes = [];
        if (task.is_critical) classes.push("gantt-critical");
        if (task.is_milestone) classes.push("gantt-milestone");
        if (task.status === "completed") classes.push("gantt-completed");
        // Milestones have start_date === end_date (duration_days = 0); give
        // them a 1-day visual width since frappe-gantt 0.6.1 renders a
        // zero-width bar as invisible (see ADR-021).
        const visualEnd = task.is_milestone ? task.start_date : task.end_date;
        return {
          id: task.id,
          name: `${task.wbs_code} ${task.name}`,
          start: task.start_date,
          end: visualEnd,
          progress: task.percent_complete,
          dependencies: (predecessorsByTask.get(task.id) ?? []).join(","),
          custom_class: classes.join(" "),
        };
      }),
    [tasks, predecessorsByTask],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (ganttTasks.length === 0) {
      container.innerHTML = "";
      ganttRef.current = null;
      return;
    }

    if (!ganttRef.current) {
      ganttRef.current = new Gantt(container, ganttTasks, {
        view_mode: viewMode,
        column_width: viewMode === "Day" ? 42 : viewMode === "Week" ? 140 : 120,
        on_click: (task) => onTaskClickRef.current(task.id),
        on_date_change: (task, start, end) => {
          const original = taskById.get(task.id);
          const startIso = toIsoDate(start);
          if (original?.is_milestone) {
            // Milestones keep duration_days = 0 server-side (ADR-012);
            // only the date moves.
            onDateChangeRef.current(task.id, startIso, 0);
            return;
          }
          const durationDays = inclusiveDaySpan(start, end);
          onDateChangeRef.current(task.id, startIso, durationDays);
        },
        custom_popup_html: (task) => {
          const original = taskById.get(task.id);
          if (!original) return "";
          const floatText =
            original.total_float === null ? "n/a" : `${original.total_float}d float`;
          return `
            <div class="gantt-popup">
              <h5>${original.wbs_code} ${original.name}</h5>
              <p>${original.start_date} → ${original.end_date}</p>
              <p>${original.percent_complete}% complete · ${floatText}${
                original.is_critical ? " · <strong>critical</strong>" : ""
              }</p>
            </div>`;
        },
      });
    } else {
      ganttRef.current.refresh(ganttTasks);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Gantt instance is imperative; only data should retrigger.
  }, [ganttTasks]);

  useEffect(() => {
    ganttRef.current?.change_view_mode(viewMode);
  }, [viewMode]);

  return (
    <div className="gantt-chart-container">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1 rounded-md border border-jira-border bg-white p-0.5">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => setViewMode(mode.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                viewMode === mode.value
                  ? "bg-brand-600 text-white"
                  : "text-jira-textSub hover:bg-jira-hover"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-jira-textSub">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-jira-red/20 ring-1 ring-jira-red" />
            Critical path
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-jira-orange/20 ring-1 ring-jira-orange" />
            Milestone
          </span>
        </div>
      </div>
      {tasks.length === 0 ? (
        <div className="card p-8 text-center text-sm text-jira-textSub">
          No tasks yet. Create a task to see it on the Gantt chart.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-jira-border bg-white p-2">
          <div ref={containerRef} />
        </div>
      )}
    </div>
  );
}
