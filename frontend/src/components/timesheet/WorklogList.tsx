import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UserRead, WorklogRead } from "@/types/api";
import { useAuthStore } from "@/store/authStore";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { IconButton } from "@/components/common/IconButton";
import { WorklogForm } from "@/components/timesheet/WorklogForm";
import { useDateFormat } from "@/hooks/useDateFormat";
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
  const { t } = useTranslation();
  const formatDate = useDateFormat();
  const currentUser = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState<WorklogRead | null>(null);
  const [deleting, setDeleting] = useState<WorklogRead | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const userNameById = new Map(users.map((u) => [u.id, u.full_name]));

  function canManage(w: WorklogRead): boolean {
    return currentUser?.role === "admin" || currentUser?.id === w.user_id;
  }

  if (worklogs.length === 0) {
    return <p className="py-4 text-sm text-jira-textSub">{t("worklogs.noHoursYet")}</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-jira-border text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-jira-textSub">
              {getTaskLabel && <th className="py-1.5 pr-3">{t("worklogs.task")}</th>}
              <th className="py-1.5 pr-3">{t("common.date")}</th>
              <th className="py-1.5 pr-3">{t("worklogs.user")}</th>
              <th className="py-1.5 pr-3">{t("worklogs.hours")}</th>
              <th className="py-1.5 pr-3">{t("common.description")}</th>
              <th className="py-1.5 pr-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-jira-borderSoft">
            {worklogs.map((w) => (
              <tr key={w.id} className="hover:bg-jira-hover">
                {getTaskLabel && (
                  <td className="py-1.5 pr-3 max-w-[12rem] truncate text-jira-text" title={getTaskLabel(w)}>
                    {getTaskLabel(w)}
                  </td>
                )}
                <td className="py-1.5 pr-3 whitespace-nowrap text-jira-text">{formatDate(w.work_date)}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap text-jira-text">
                  {w.user_id === currentUser?.id
                    ? t("worklogs.you")
                    : (userNameById.get(w.user_id) ?? w.user_id.slice(0, 8))}
                </td>
                <td className="py-1.5 pr-3 text-jira-text">{w.hours}</td>
                <td className="py-1.5 pr-3 text-jira-textSub">{w.description ?? "—"}</td>
                <td className="py-1.5 pr-3 text-right">
                  {canManage(w) && (
                    <div className="flex justify-end gap-1">
                      <IconButton
                        icon={Pencil}
                        size="sm"
                        aria-label={t("worklogs.editWorklog")}
                        onClick={() => setEditing(w)}
                      />
                      <IconButton
                        icon={Trash2}
                        size="sm"
                        aria-label={t("worklogs.deleteWorklog")}
                        className="hover:bg-jira-red/10 hover:text-jira-red"
                        onClick={() => setDeleting(w)}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={t("worklogs.editWorklog")} onClose={() => setEditing(null)}>
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
          title={t("worklogs.deleteWorklog")}
          message={t("worklogs.deleteWorklogMessage", {
            hours: deleting.hours,
            date: formatDate(deleting.work_date),
          })}
          confirmLabel={t("common.delete")}
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
