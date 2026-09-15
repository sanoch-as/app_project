import type { ProjectStatus, TaskPriority, TaskStatus } from "@/types/api";
import clsx from "clsx";

const projectStatusStyles: Record<ProjectStatus, string> = {
  planning: "bg-slate-100 text-slate-700",
  active: "bg-green-100 text-green-800",
  on_hold: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-700",
};

const taskStatusStyles: Record<TaskStatus, string> = {
  not_started: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-800",
  blocked: "bg-red-100 text-red-700",
  completed: "bg-green-100 text-green-800",
};

const priorityStyles: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-700",
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Pill className={projectStatusStyles[status]}>{status.replace("_", " ")}</Pill>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Pill className={taskStatusStyles[status]}>{status.replace("_", " ")}</Pill>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Pill className={priorityStyles[priority]}>{priority}</Pill>;
}

/** SPI/CPI read below 1.0 as behind schedule/over budget (red), >=1 as on/ahead (green). */
export function IndexBadge({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        {label}: n/a
      </span>
    );
  }
  const good = value >= 1;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        good ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700",
      )}
      title={good ? "On/ahead of plan" : "Behind plan"}
    >
      {label}: {value.toFixed(2)}
    </span>
  );
}
