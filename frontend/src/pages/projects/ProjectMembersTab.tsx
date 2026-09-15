import { useMemo, useState } from "react";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useAuthStore } from "@/store/authStore";
import {
  useAddProjectMember,
  useProjectMembers,
  useRemoveProjectMember,
} from "@/hooks/useProjects";
import { useUsers } from "@/hooks/useUsers";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { AdminOnly } from "@/components/common/ProtectedRoute";

export function ProjectMembersTab() {
  const { project } = useProjectDetailContext();
  const role = useAuthStore((s) => s.user?.role);
  const { data: members, isLoading, error } = useProjectMembers(project.id);
  const { data: orgUsers } = useUsers({ limit: 100 });
  const addMember = useAddProjectMember(project.id);
  const removeMember = useRemoveProjectMember(project.id);
  const [selectedUserId, setSelectedUserId] = useState("");

  const availableUsers = useMemo(() => {
    const memberIds = new Set((members ?? []).map((m) => m.user.id));
    return (orgUsers?.items ?? []).filter((u) => !memberIds.has(u.id));
  }, [members, orgUsers]);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">Project members</h2>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error ?? addMember.error ?? removeMember.error} />

      <div className="card divide-y divide-slate-100">
        {(members ?? []).map((member) => (
          <div key={member.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <div>
              <div className="font-medium text-slate-800">{member.user.full_name}</div>
              <div className="text-xs text-slate-500">
                {member.user.email} · <span className="capitalize">{member.user.role}</span>
              </div>
            </div>
            {role === "admin" && (
              <button
                type="button"
                className="text-xs font-medium text-red-600 hover:underline"
                onClick={() => removeMember.mutate(member.user.id)}
                disabled={removeMember.isPending}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {(members ?? []).length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">No members yet.</div>
        )}
      </div>

      <AdminOnly>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Add member</h3>
          <div className="flex gap-2">
            <select
              className="input"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select a user…</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-primary shrink-0"
              disabled={!selectedUserId || addMember.isPending}
              onClick={() => {
                addMember.mutate({ user_id: selectedUserId });
                setSelectedUserId("");
              }}
            >
              Add
            </button>
          </div>
          {availableUsers.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Every organization user is already a member of this project.
            </p>
          )}
        </div>
      </AdminOnly>
    </div>
  );
}
