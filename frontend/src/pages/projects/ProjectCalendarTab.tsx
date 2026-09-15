import { useMemo, useState } from "react";
import clsx from "clsx";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useGantt } from "@/hooks/useTasks";
import { useProjectMembers } from "@/hooks/useProjects";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { TaskFormModal } from "@/pages/tasks/TaskFormModal";
import type { TaskRead } from "@/types/api";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday-start 6-week grid covering the given month (plain CSS grid — no calendar library, per the brief). */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function ProjectCalendarTab() {
  const { project } = useProjectDetailContext();
  const { data, isLoading, error } = useGantt(project.id);
  const { data: members } = useProjectMembers(project.id);
  const [cursor, setCursor] = useState(() => new Date());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const memberUsers = useMemo(() => (members ?? []).map((m) => m.user), [members]);
  const days = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskRead[]>();
    if (!data) return map;
    for (const task of data.tasks) {
      const start = new Date(task.start_date);
      const end = new Date(task.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = toIso(d);
        const list = map.get(key) ?? [];
        list.push(task);
        map.set(key, list);
      }
    }
    return map;
  }, [data]);

  if (isLoading) return <LoadingSpinner label="Loading calendar…" />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayIso = toIso(new Date());
  const editingTask = data.tasks.find((t) => t.id === editingTaskId) ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{monthLabel}</h2>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          >
            ← Prev
          </button>
          <button className="btn-secondary" onClick={() => setCursor(new Date())}>
            Today
          </button>
          <button
            className="btn-secondary"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          >
            Next →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-slate-200 bg-slate-200 [&>*]:bg-white">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-1.5 text-center text-xs font-medium text-slate-500">
            {label}
          </div>
        ))}
        {days.map((day) => {
          const iso = toIso(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const dayTasks = tasksByDay.get(iso) ?? [];
          return (
            <div
              key={iso}
              className={clsx(
                "min-h-[6.5rem] border-t border-slate-100 p-1.5 align-top",
                !inMonth && "bg-slate-50 text-slate-300",
                iso === todayIso && "bg-amber-50",
              )}
            >
              <div className="mb-1 text-right text-xs font-medium text-slate-400">
                {day.getDate()}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => setEditingTaskId(task.id)}
                    className={clsx(
                      "block w-full truncate rounded px-1 py-0.5 text-left text-[11px]",
                      task.is_milestone
                        ? "bg-amber-200 text-amber-900"
                        : task.is_critical
                          ? "bg-red-100 text-red-800"
                          : "bg-brand-100 text-brand-800",
                    )}
                    title={task.name}
                  >
                    {task.is_milestone ? "🔶 " : ""}
                    {task.name}
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <div className="px-1 text-[10px] text-slate-400">+{dayTasks.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editingTask && (
        <TaskFormModal
          projectId={project.id}
          initial={editingTask}
          allTasks={data.tasks}
          members={memberUsers}
          onClose={() => setEditingTaskId(null)}
        />
      )}
    </div>
  );
}
