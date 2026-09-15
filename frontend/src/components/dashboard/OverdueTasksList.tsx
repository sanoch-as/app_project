import { AlertTriangle, PartyPopper } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OverdueTask } from "@/types/api";
import { TaskStatusBadge } from "@/components/common/Badge";
import { useDateFormat } from "@/hooks/useDateFormat";

export function OverdueTasksList({ tasks }: { tasks: OverdueTask[] }) {
  const { t } = useTranslation();
  const formatDate = useDateFormat();
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-jira-text">
        {t("dashboard.overdueTasksTitle")} {tasks.length > 0 && `(${tasks.length})`}
      </h3>
      {tasks.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-jira-textSub">
          <PartyPopper className="h-3.5 w-3.5" aria-hidden="true" />
          {t("dashboard.nothingOverdue")}
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between text-sm">
              <span className="text-jira-text">{task.name}</span>
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-jira-red">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {t("dashboard.due", { date: formatDate(task.end_date) })}
                </span>
                <TaskStatusBadge status={task.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
