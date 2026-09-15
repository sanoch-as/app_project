import type { OverdueTask } from "@/types/api";
import { TaskStatusBadge } from "@/components/common/Badge";

export function OverdueTasksList({ tasks }: { tasks: OverdueTask[] }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">
        Overdue tasks {tasks.length > 0 && `(${tasks.length})`}
      </h3>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing overdue. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{task.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-red-600">due {task.end_date}</span>
                <TaskStatusBadge status={task.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
