import { useTranslation } from "react-i18next";
import type { ProjectStatus, TaskPriority, TaskStatus } from "@/types/api";
import clsx from "clsx";

type Tone = "blue" | "green" | "gray" | "orange" | "red" | "purple";

const toneClasses: Record<Tone, string> = {
  blue: "bg-jira-blueBadgeBg text-jira-blueBadgeText",
  green: "bg-jira-greenBadgeBg text-jira-greenBadgeText",
  gray: "bg-jira-grayBadgeBg text-jira-grayBadgeText",
  orange: "bg-orange-50 text-jira-orange",
  red: "bg-red-50 text-jira-red",
  purple: "bg-purple-50 text-jira-purple",
};

const projectStatusTone: Record<ProjectStatus, Tone> = {
  planning: "gray",
  active: "green",
  on_hold: "orange",
  completed: "blue",
  cancelled: "red",
};

const taskStatusTone: Record<TaskStatus, Tone> = {
  not_started: "gray",
  in_progress: "blue",
  blocked: "red",
  completed: "green",
};

const priorityTone: Record<TaskPriority, Tone> = {
  low: "gray",
  medium: "blue",
  high: "orange",
  critical: "red",
};

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={clsx("badge-pill", toneClasses[tone])}>{children}</span>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useTranslation();
  return <Pill tone={projectStatusTone[status]}>{t(`enums.projectStatus.${status}`)}</Pill>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useTranslation();
  return <Pill tone={taskStatusTone[status]}>{t(`enums.taskStatus.${status}`)}</Pill>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const { t } = useTranslation();
  return <Pill tone={priorityTone[priority]}>{t(`enums.taskPriority.${priority}`)}</Pill>;
}

/** SPI/CPI read below 1.0 as behind schedule/over budget (red), >=1 as on/ahead (green). */
export function IndexBadge({ label, value }: { label: string; value: number | null }) {
  const { t } = useTranslation();
  if (value === null) {
    return (
      <span className="badge-pill bg-jira-grayBadgeBg text-jira-textSub normal-case">
        {label}: {t("common.notApplicable")}
      </span>
    );
  }
  const good = value >= 1;
  return (
    <span
      className={clsx("badge-pill normal-case", good ? toneClasses.green : toneClasses.red)}
      title={good ? t("common.onAheadOfPlan") : t("common.behindPlan")}
    >
      {label}: {value.toFixed(2)}
    </span>
  );
}
