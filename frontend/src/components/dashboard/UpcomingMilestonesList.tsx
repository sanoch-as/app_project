import { Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UpcomingMilestone } from "@/types/api";
import { useDateFormat } from "@/hooks/useDateFormat";

export function UpcomingMilestonesList({ milestones }: { milestones: UpcomingMilestone[] }) {
  const { t } = useTranslation();
  const formatDate = useDateFormat();
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-jira-text">
        {t("dashboard.upcomingMilestonesTitle")}
      </h3>
      {milestones.length === 0 ? (
        <p className="text-sm text-jira-textSub">{t("dashboard.noUpcomingMilestones")}</p>
      ) : (
        <ul className="space-y-2">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-jira-text">
                <Diamond className="h-3 w-3 fill-jira-orange text-jira-orange" aria-hidden="true" />
                {m.name}
              </span>
              <span className="text-xs text-jira-textSub">{formatDate(m.start_date)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
