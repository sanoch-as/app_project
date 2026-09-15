import { useState, type DragEvent } from "react";
import clsx from "clsx";
import { Diamond } from "lucide-react";
import type { TaskRead, TaskStatus } from "@/types/api";
import { PriorityBadge } from "@/components/common/Badge";
import { Avatar } from "@/components/common/Avatar";

interface KanbanBoardProps {
  tasks: TaskRead[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onTaskClick: (taskId: string) => void;
}

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "not_started", label: "Not started" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "completed", label: "Completed" },
];

/**
 * Native HTML5 drag-and-drop between columns (no DnD library — per the
 * "don't add unlisted dependencies" rule in the brief; see docs/DECISIONS.md).
 * Hover/elevation styling here intentionally avoids `transform` so it can't
 * interfere with native `dragstart` hit-testing.
 */
export function KanbanBoard({ tasks, onStatusChange, onTaskClick }: KanbanBoardProps) {
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  function handleDragStart(e: DragEvent<HTMLDivElement>, taskId: string) {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, status: TaskStatus) {
    e.preventDefault();
    setDragOverStatus(null);
    const taskId = e.dataTransfer.getData("text/plain");
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== status) {
      onStatusChange(taskId, status);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {COLUMNS.map((column) => {
        const columnTasks = tasks.filter((t) => t.status === column.status);
        return (
          <div
            key={column.status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStatus(column.status);
            }}
            onDragLeave={() => setDragOverStatus((s) => (s === column.status ? null : s))}
            onDrop={(e) => handleDrop(e, column.status)}
            className={clsx(
              "min-h-[16rem] rounded-lg border p-2 transition-colors",
              dragOverStatus === column.status
                ? "border-brand-400 bg-jira-blueBadgeBg"
                : "border-transparent bg-jira-panel",
            )}
          >
            <div className="mb-2 flex items-center justify-between px-1.5 py-1">
              <h3 className="text-xs font-bold uppercase tracking-wide text-jira-textSub">
                {column.label}
              </h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-jira-textSub shadow-jira-sm">
                {columnTasks.length}
              </span>
            </div>
            <div className="space-y-2">
              {columnTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onClick={() => onTaskClick(task.id)}
                  className={clsx(
                    "cursor-grab rounded-lg border bg-white p-2.5 text-sm shadow-jira-sm hover:border-brand-300 active:cursor-grabbing",
                    task.is_critical ? "border-jira-red/40" : "border-jira-borderSoft",
                  )}
                >
                  <div className="mb-2 flex items-start gap-1.5 text-[13.5px] font-medium leading-snug text-jira-text">
                    {task.is_milestone && (
                      <Diamond
                        className="mt-0.5 h-3 w-3 shrink-0 fill-jira-orange text-jira-orange"
                        aria-label="Milestone"
                      />
                    )}
                    <span>{task.name}</span>
                  </div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded bg-jira-blueBadgeBg px-1.5 py-0.5 font-mono text-[11px] font-semibold text-jira-blueBadgeText">
                      {task.wbs_code}
                    </span>
                    <span className="text-xs text-jira-textSub">{task.percent_complete}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <PriorityBadge priority={task.priority} />
                    {task.assignees.length > 0 && (
                      <div className="flex -space-x-1.5">
                        {task.assignees.slice(0, 3).map((a) => (
                          <Avatar
                            key={a.user.id}
                            name={a.user.full_name}
                            size="sm"
                            className="ring-2 ring-white"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {columnTasks.length === 0 && (
                <div className="rounded border border-dashed border-jira-border p-4 text-center text-xs text-jira-textSub">
                  Drop tasks here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
