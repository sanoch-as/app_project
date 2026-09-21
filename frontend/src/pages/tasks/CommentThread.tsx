import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/common/Avatar";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { IconButton } from "@/components/common/IconButton";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useCreateComment, useDeleteComment, useTaskComments } from "@/hooks/useComments";
import { useAuthStore } from "@/store/authStore";
import type { UserRead } from "@/types/api";

interface CommentThreadProps {
  taskId: string;
  members: UserRead[];
}

/** Comment thread for a task (ADR-031) — the task-edit form fields live in
 * their own <form>; this renders as a sibling section below it (HTML forms
 * cannot nest), with its own submit handler. Deletion uses an inline,
 * in-row confirmation rather than ConfirmDialog, since ConfirmDialog wraps
 * Modal and this component is itself mounted inside TaskFormModal's Modal —
 * nesting would double-fire Escape (see Modal.tsx, ADR-031). */
export function CommentThread({ taskId, members }: CommentThreadProps) {
  const { t, i18n } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const { data, isLoading, error } = useTaskComments(taskId);
  const createComment = useCreateComment(taskId);
  const deleteComment = useDeleteComment(taskId);
  const [body, setBody] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const nameById = new Map(members.map((m) => [m.id, m.full_name]));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (body.trim() === "") return;
    createComment.mutate({ body }, { onSuccess: () => setBody("") });
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-jira-text">
        {t("comments.title", { count: data?.total ?? 0 })}
      </h3>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />
      {data && data.items.length === 0 && (
        <p className="mb-2 text-sm text-jira-textSub">{t("comments.noneYet")}</p>
      )}

      {data && data.items.length > 0 && (
        <ul className="mb-3 space-y-2">
          {data.items.map((c) => {
            const isSelf = c.user_id === currentUser?.id;
            const authorName = isSelf
              ? (currentUser?.full_name ?? t("worklogs.you"))
              : (nameById.get(c.user_id) ?? c.user_id.slice(0, 8));
            const canDelete = currentUser?.role === "admin" || isSelf;

            return (
              <li key={c.id} className="flex gap-2">
                <Avatar name={authorName} size="sm" />
                <div className="flex-1 rounded-md bg-jira-hover/60 p-2">
                  {confirmingDeleteId === c.id ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-jira-text">{t("comments.confirmDelete")}</span>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          className="text-jira-textSub hover:underline"
                          onClick={() => setConfirmingDeleteId(null)}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          className="font-semibold text-jira-red hover:underline"
                          disabled={deleteComment.isPending}
                          onClick={() => {
                            deleteComment.mutate(c.id);
                            setConfirmingDeleteId(null);
                          }}
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-jira-text">
                          {isSelf ? t("worklogs.you") : authorName}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-jira-textSub">
                            {new Date(c.created_at).toLocaleString(i18n.language, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                          {canDelete && (
                            <IconButton
                              icon={Trash2}
                              size="sm"
                              aria-label={t("comments.deleteComment")}
                              className="hover:bg-jira-red/10 hover:text-jira-red"
                              onClick={() => setConfirmingDeleteId(c.id)}
                            />
                          )}
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-jira-text">{c.body}</p>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          className="input"
          rows={2}
          maxLength={5000}
          placeholder={t("comments.placeholder")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <ErrorMessage error={createComment.error} />
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn-primary"
            disabled={createComment.isPending || body.trim() === ""}
          >
            {createComment.isPending ? t("common.saving") : t("comments.add")}
          </button>
        </div>
      </form>
    </div>
  );
}
