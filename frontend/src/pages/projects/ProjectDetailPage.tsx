import { useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import clsx from "clsx";
import { useProject } from "@/hooks/useProjects";
import { useAuthStore } from "@/store/authStore";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { ProjectStatusBadge } from "@/components/common/Badge";
import { ProjectFormModal } from "@/pages/projects/ProjectFormModal";

const TABS = [
  { to: "overview", label: "Overview" },
  { to: "gantt", label: "Gantt" },
  { to: "tasks", label: "Tasks" },
  { to: "kanban", label: "Kanban" },
  { to: "calendar", label: "Calendar" },
  { to: "baselines", label: "Baselines" },
  { to: "worklogs", label: "Worklogs" },
  { to: "members", label: "Members" },
  { to: "reports", label: "Reports" },
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
            <h1 className="text-xl font-semibold text-slate-900">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          {project.description && (
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{project.description}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {project.start_date ?? "no start date"} → {project.end_date ?? "no end date"}
          </p>
        </div>
        {role === "admin" && (
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
            Edit project
          </button>
        )}
      </div>

      <div className="mb-6 border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap gap-4">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                clsx(
                  "border-b-2 px-1 py-2 text-sm font-medium",
                  isActive
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
                )
              }
            >
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
