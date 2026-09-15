import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useDeleteProject, useProjects } from "@/hooks/useProjects";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ProjectStatusBadge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { ProjectFormModal } from "@/pages/projects/ProjectFormModal";
import type { ProjectRead } from "@/types/api";

export function ProjectsListPage() {
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading, error } = useProjects({ limit: 100 });
  const deleteProject = useDeleteProject();

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ProjectRead | null>(null);
  const [deleting, setDeleting] = useState<ProjectRead | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-jira-text">Projects</h1>
          <p className="text-sm text-jira-textSub">All projects visible to you.</p>
        </div>
        {role === "admin" && (
          <Button variant="primary" iconLeft={Plus} onClick={() => setShowCreate(true)}>
            New project
          </Button>
        )}
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {data && (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-jira-border text-sm">
            <thead className="bg-jira-panel">
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-jira-textSub">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Start</th>
                <th className="px-4 py-2">End</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-jira-borderSoft">
              {data.items.map((project) => (
                <tr key={project.id} className="hover:bg-jira-hover">
                  <td className="px-4 py-2 font-medium text-jira-text">
                    <Link to={`/projects/${project.id}/overview`} className="hover:underline">
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <ProjectStatusBadge status={project.status} />
                  </td>
                  <td className="px-4 py-2 text-jira-textSub">{project.start_date ?? "—"}</td>
                  <td className="px-4 py-2 text-jira-textSub">{project.end_date ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {role === "admin" && (
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-600 hover:underline"
                          onClick={() => setEditing(project)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs font-medium text-jira-red hover:underline"
                          onClick={() => setDeleting(project)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-jira-textSub">
                    No projects yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <ProjectFormModal onClose={() => setShowCreate(false)} />}
      {editing && <ProjectFormModal initial={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete project"
          message={`Delete "${deleting.name}" and all of its tasks, dependencies, baselines and worklogs? This cannot be undone.`}
          confirmLabel="Delete"
          busy={deleteProject.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            deleteProject.mutate(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
