import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Diamond } from "lucide-react";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useGantt } from "@/hooks/useTasks";
import { useProjectMembers } from "@/hooks/useProjects";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Button } from "@/components/common/Button";
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
        <h2 className="text-sm font-semibold text-jira-text">{monthLabel}</h2>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            iconLeft={ChevronLeft}
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          >
            Prev
          </Button>
          <Button variant="secondary" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button
            variant="secondary"
            iconRight={ChevronRight}
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-jira-border bg-jira-border [&>*]:bg-white">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-1.5 text-center text-xs font-medium text-jira-textSub">
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
                "min-h-[6.5rem] border-t border-jira-borderSoft p-1.5 align-top",
                !inMonth && "bg-jira-panel text-jira-textSub/50",
                iso === todayIso && "bg-jira-blueBadgeBg",
              )}
            >
              <div className="mb-1 text-right text-xs font-medium text-jira-textSub">
                {day.getDate()}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => setEditingTaskId(task.id)}
                    className={clsx(
                      "flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px]",
                      task.is_milestone
                        ? "bg-orange-50 text-jira-orange"
                        : task.is_critical
                          ? "bg-red-50 text-jira-red"
                          : "bg-jira-blueBadgeBg text-jira-blueBadgeText",
                    )}
                    title={task.name}
                  >
                    {task.is_milestone && <Diamond className="h-2.5 w-2.5 shrink-0 fill-current" aria-hidden="true" />}
                    <span className="truncate">{task.name}</span>
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <div className="px-1 text-[10px] text-jira-textSub">+{dayTasks.length - 3} more</div>
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
