import { useState, type DragEvent } from "react";
import clsx from "clsx";
import type { TaskRead, TaskStatus } from "@/types/api";
import { PriorityBadge } from "@/components/common/Badge";

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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              "min-h-[16rem] rounded-lg border-2 border-dashed p-2 transition-colors",
              dragOverStatus === column.status
                ? "border-brand-400 bg-brand-50"
                : "border-transparent bg-slate-100",
            )}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-slate-700">{column.label}</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 shadow-sm">
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
                    "cursor-grab card p-3 text-sm hover:shadow-md active:cursor-grabbing",
                    task.is_critical && "border-red-300",
                  )}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-800">{task.name}</span>
                    {task.is_milestone && <span title="Milestone">🔶</span>}
                  </div>
                  <div className="mb-2 text-xs text-slate-400">{task.wbs_code}</div>
                  <div className="flex items-center justify-between">
                    <PriorityBadge priority={task.priority} />
                    <span className="text-xs text-slate-500">{task.percent_complete}%</span>
                  </div>
                  {task.assignees.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {task.assignees.map((a) => (
                        <span
                          key={a.user.id}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                        >
                          {a.user.full_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {columnTasks.length === 0 && (
                <div className="rounded border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
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
