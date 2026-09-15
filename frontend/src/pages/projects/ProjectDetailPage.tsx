import { useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import clsx from "clsx";
import {
  Calendar,
  FileBarChart2,
  GanttChartSquare,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  Milestone,
  Pencil,
  Clock,
  Users,
} from "lucide-react";
import { useProject } from "@/hooks/useProjects";
import { useAuthStore } from "@/store/authStore";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { ProjectStatusBadge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { ProjectFormModal } from "@/pages/projects/ProjectFormModal";

const TABS = [
  { to: "overview", label: "Overview", icon: LayoutDashboard },
  { to: "gantt", label: "Gantt", icon: GanttChartSquare },
  { to: "tasks", label: "Tasks", icon: ListChecks },
  { to: "kanban", label: "Kanban", icon: KanbanSquare },
  { to: "calendar", label: "Calendar", icon: Calendar },
  { to: "baselines", label: "Baselines", icon: Milestone },
  { to: "worklogs", label: "Worklogs", icon: Clock },
  { to: "members", label: "Members", icon: Users },
  { to: "reports", label: "Reports", icon: FileBarChart2 },
];

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading, error } = useProject(projectId);
  const role = useAuthStore((s) => s.user?.role);
  const [editing, setEditing] = useState(false);

  if (isLoading) return <LoadingSpinner label="Loading project…" />;
  if (error) return <ErrorMessage error={error} />;
  if (!project) return null;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-jira-text">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          {project.description && (
            <p className="mt-1 max-w-2xl text-sm text-jira-textSub">{project.description}</p>
          )}
          <p className="mt-1 text-xs text-jira-textSub">
            {project.start_date ?? "no start date"} → {project.end_date ?? "no end date"}
          </p>
        </div>
        {role === "admin" && (
          <Button variant="secondary" iconLeft={Pencil} onClick={() => setEditing(true)}>
            Edit project
          </Button>
        )}
      </div>

      <div className="mb-6 overflow-x-auto border-b border-jira-border">
        <nav className="-mb-px flex flex-nowrap gap-1">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium",
                  isActive
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-jira-textSub hover:bg-jira-hover hover:text-jira-text",
                )
              }
            >
              <tab.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet context={{ project }} />

      {editing && <ProjectFormModal initial={project} onClose={() => setEditing(false)} />}
    </div>
  );
}
