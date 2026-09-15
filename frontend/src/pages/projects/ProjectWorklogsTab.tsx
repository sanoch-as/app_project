import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useGantt } from "@/hooks/useTasks";
import { useWorklogsReport } from "@/hooks/useWorklogs";
import { useProjectMembers } from "@/hooks/useProjects";
import { worklogsApi } from "@/api/worklogs";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { WorklogForm } from "@/components/timesheet/WorklogForm";
import { WorklogList } from "@/components/timesheet/WorklogList";
import type { WorklogCreate } from "@/types/api";

export function ProjectWorklogsTab() {
  const { t } = useTranslation();
  const { project } = useProjectDetailContext();
  const queryClient = useQueryClient();
  const { data: gantt } = useGantt(project.id);
  const { data: members } = useProjectMembers(project.id);
  const { data, isLoading, error } = useWorklogsReport({ project_id: project.id, limit: 100 });

  const [logForTaskId, setLogForTaskId] = useState("");
  const [showLogModal, setShowLogModal] = useState(false);

  const taskById = useMemo(() => new Map((gantt?.tasks ?? []).map((t) => [t.id, t])), [gantt]);
  const memberUsers = useMemo(() => (members ?? []).map((m) => m.user), [members]);

  function invalidateAfterWrite() {
    queryClient.invalidateQueries({ queryKey: ["reports", "worklogs"] });
    queryClient.invalidateQueries({ queryKey: ["projects", project.id, "progress"] });
    queryClient.invalidateQueries({ queryKey: ["projects", project.id, "dashboard"] });
  }

  const createWorklog = useMutation({
    mutationFn: (payload: WorklogCreate) => worklogsApi.create(logForTaskId, payload),
    onSuccess: () => {
      invalidateAfterWrite();
      setShowLogModal(false);
    },
  });

  const updateWorklog = useMutation({
    mutationFn: ({
      worklogId,
      payload,
    }: {
      worklogId: string;
      payload: { work_date: string; hours: number; description: string | null };
    }) => worklogsApi.update(worklogId, payload),
    onSuccess: invalidateAfterWrite,
  });

  const deleteWorklog = useMutation({
    mutationFn: (worklogId: string) => worklogsApi.remove(worklogId),
    onSuccess: invalidateAfterWrite,
  });

  function taskLabel(w: { task_id: string }): string {
    const task = taskById.get(w.task_id);
    return task ? `${task.wbs_code} ${task.name}` : w.task_id.slice(0, 8);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-jira-text">
          {t("worklogs.timesheetTitle", { name: project.name })}
        </h2>
        <Button variant="primary" iconLeft={Plus} onClick={() => setShowLogModal(true)}>
          {t("worklogs.logHours")}
        </Button>
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {data && (
        <div className="card p-4">
          <WorklogList
            worklogs={data.items}
            users={memberUsers}
            isUpdating={updateWorklog.isPending}
            isDeleting={deleteWorklog.isPending}
            onUpdate={(worklogId, payload) => updateWorklog.mutate({ worklogId, payload })}
            onDelete={(worklogId) => deleteWorklog.mutate(worklogId)}
            getTaskLabel={taskLabel}
          />
        </div>
      )}

      {showLogModal && (
        <Modal title={t("worklogs.logHours")} onClose={() => setShowLogModal(false)}>
          <div className="mb-3">
            <label className="label" htmlFor="task_select">
              {t("worklogs.task")}
            </label>
            <select
              id="task_select"
              className="input"
              value={logForTaskId}
              onChange={(e) => setLogForTaskId(e.target.value)}
            >
              <option value="">{t("worklogs.selectTask")}</option>
              {(gantt?.tasks ?? []).map((task) => (
                <option key={task.id} value={task.id}>
                  {task.wbs_code} — {task.name}
                </option>
              ))}
            </select>
          </div>
          {logForTaskId && (
            <WorklogForm
              isPending={createWorklog.isPending}
              error={createWorklog.error}
              onCancel={() => setShowLogModal(false)}
              onSubmit={(payload) => createWorklog.mutate(payload)}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
