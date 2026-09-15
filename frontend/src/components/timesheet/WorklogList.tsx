import { useState } from "react";
import type { UserRead, WorklogRead } from "@/types/api";
import { useAuthStore } from "@/store/authStore";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { WorklogForm } from "@/components/timesheet/WorklogForm";
import { getApiErrorMessage } from "@/api/client";

interface WorklogListProps {
  worklogs: WorklogRead[];
  users?: UserRead[];
  onUpdate: (worklogId: string, payload: { work_date: string; hours: number; description: string | null }) => void;
  onDelete: (worklogId: string) => void;
  isUpdating?: boolean;
  isDeleting?: boolean;
  /** When provided, renders an extra "Task" column (used by the project-wide timesheet view, which spans many tasks). */
  getTaskLabel?: (worklog: WorklogRead) => string;
}

/**
 * Renders edit/delete controls only for the worklog's own owner or an admin
 * — the backend enforces this too (docs/api-conventions.md: "Editing/
 * deleting one requires being its owner or an admin"), but the UI hides
 * controls it knows will 403 rather than showing then failing.
 */
export function WorklogList({
  worklogs,
  users = [],
  onUpdate,
  onDelete,
  isUpdating,
  isDeleting,
  getTaskLabel,
}: WorklogListProps) {
  const currentUser = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState<WorklogRead | null>(null);
  const [deleting, setDeleting] = useState<WorklogRead | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const userNameById = new Map(users.map((u) => [u.id, u.full_name]));

  function canManage(w: WorklogRead): boolean {
    return currentUser?.role === "admin" || currentUser?.id === w.user_id;
  }

  if (worklogs.length === 0) {
    return <p className="py-4 text-sm text-slate-400">No hours logged yet.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              {getTaskLabel && <th className="py-1.5 pr-3">Task</th>}
              <th className="py-1.5 pr-3">Date</th>
              <th className="py-1.5 pr-3">User</th>
              <th className="py-1.5 pr-3">Hours</th>
              <th className="py-1.5 pr-3">Description</th>
              <th className="py-1.5 pr-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {worklogs.map((w) => (
              <tr key={w.id}>
                {getTaskLabel && (
                  <td className="py-1.5 pr-3 max-w-[12rem] truncate" title={getTaskLabel(w)}>
                    {getTaskLabel(w)}
                  </td>
                )}
                <td className="py-1.5 pr-3 whitespace-nowrap">{w.work_date}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {w.user_id === currentUser?.id
                    ? "You"
                    : (userNameById.get(w.user_id) ?? w.user_id.slice(0, 8))}
                </td>
                <td className="py-1.5 pr-3">{w.hours}</td>
                <td className="py-1.5 pr-3 text-slate-500">{w.description ?? "—"}</td>
                <td className="py-1.5 pr-3 text-right">
                  {canManage(w) && (
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="text-xs font-medium text-brand-600 hover:underline"
                        onClick={() => setEditing(w)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-red-600 hover:underline"
                        onClick={() => setDeleting(w)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title="Edit worklog" onClose={() => setEditing(null)}>
          <WorklogForm
            initial={editing}
            isPending={isUpdating}
            error={actionError}
            onCancel={() => {
              setEditing(null);
              setActionError(null);
            }}
            onSubmit={(payload) => {
              try {
                onUpdate(editing.id, {
                  work_date: payload.work_date,
                  hours: payload.hours,
                  description: payload.description ?? null,
                });
                setEditing(null);
                setActionError(null);
              } catch (err) {
                setActionError(getApiErrorMessage(err));
              }
            }}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete worklog"
          message={`Delete the ${deleting.hours}h entry on ${deleting.work_date}? This cannot be undone.`}
          confirmLabel="Delete"
          busy={isDeleting}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            onDelete(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
