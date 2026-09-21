import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TaskRead } from "@/types/api";

interface TaskBreadcrumbProps {
  task: TaskRead;
  allTasks: TaskRead[];
  onNavigate: (taskId: string) => void;
}

function buildAncestorChain(task: TaskRead, allTasks: TaskRead[]): TaskRead[] {
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const chain: TaskRead[] = [];
  const visited = new Set<string>([task.id]);
  let current = task;
  while (current.parent_task_id) {
    const parent = byId.get(current.parent_task_id);
    if (!parent || visited.has(parent.id)) break; // missing ref or defensive cycle guard
    chain.unshift(parent);
    visited.add(parent.id);
    current = parent;
  }
  return chain;
}

/** Breadcrumb-style navigation between a task and its WBS parent/children
 * (purely client-side over the already-loaded `allTasks` list — no new
 * fetch). Renders nothing for a top-level leaf task. */
export function TaskBreadcrumb({ task, allTasks, onNavigate }: TaskBreadcrumbProps) {
  const { t } = useTranslation();
  const ancestors = useMemo(() => buildAncestorChain(task, allTasks), [task, allTasks]);
  const children = useMemo(
    () => allTasks.filter((c) => c.parent_task_id === task.id),
    [allTasks, task.id],
  );

  if (ancestors.length === 0 && children.length === 0) return null;

  return (
    <div className="mb-3 space-y-1.5 text-xs">
      {ancestors.length > 0 && (
        <nav
          aria-label={t("tasks.breadcrumb.ancestors")}
          className="flex flex-wrap items-center gap-1 text-jira-textSub"
        >
          {ancestors.map((a) => (
            <span key={a.id} className="flex items-center gap-1">
              <button
                type="button"
                className="font-medium text-brand-600 hover:underline"
                onClick={() => onNavigate(a.id)}
              >
                {a.wbs_code} {a.name}
              </button>
              <span aria-hidden="true">/</span>
            </span>
          ))}
          <span className="font-semibold text-jira-text">
            {task.wbs_code} {task.name}
          </span>
        </nav>
      )}
      {children.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-jira-textSub">
          <span>{t("tasks.breadcrumb.subtasks")}:</span>
          {children.map((c) => (
            <button
              key={c.id}
              type="button"
              className="rounded bg-jira-hover px-1.5 py-0.5 font-medium text-brand-600 hover:underline"
              onClick={() => onNavigate(c.id)}
              title={c.name}
            >
              {c.wbs_code}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
