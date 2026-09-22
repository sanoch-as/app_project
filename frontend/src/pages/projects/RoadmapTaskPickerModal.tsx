import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { useUpdateTask } from "@/hooks/useTasks";
import { buildChildrenIndex, buildIndentedRows } from "@/lib/roadmap";
import { JIRA_PROJECT_ROOT_KEY } from "@/lib/jiraImport";
import type { TaskRead } from "@/types/api";

interface RoadmapTaskPickerModalProps {
  projectId: string;
  tasks: TaskRead[];
  onClose: () => void;
}

export function RoadmapTaskPickerModal({ projectId, tasks, onClose }: RoadmapTaskPickerModalProps) {
  const { t } = useTranslation();
  const updateTask = useUpdateTask(projectId);
  const rows = useMemo(() => buildIndentedRows(buildChildrenIndex(tasks)), [tasks]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(tasks.filter((task) => task.on_timeline).map((task) => task.id)),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function toggle(taskId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const original = new Set(tasks.filter((task) => task.on_timeline).map((task) => task.id));
      const changed = tasks.filter(
        (task) => selected.has(task.id) !== original.has(task.id),
      );
      await Promise.all(
        changed.map((task) =>
          updateTask.mutateAsync({
            taskId: task.id,
            payload: { on_timeline: selected.has(task.id) },
          }),
        ),
      );
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title={t("projects.overview.roadmap.pickerTitle")} onClose={onClose} widthClassName="max-w-2xl">
      <div className="space-y-3">
        <p className="text-sm text-jira-textSub">{t("projects.overview.roadmap.pickerHint")}</p>
        <ErrorMessage error={error} />
        <div className="max-h-[50vh] overflow-y-auto rounded-md border border-jira-border">
          {rows.length === 0 ? (
            <div className="px-3 py-4 text-sm text-jira-textSub">
              {t("projects.overview.roadmap.emptyNoTasks")}
            </div>
          ) : (
            rows.map(({ task, depth }) => {
              const isJiraRoot = task.external_key === JIRA_PROJECT_ROOT_KEY;
              const disabled = task.is_milestone || isJiraRoot;
              return (
                <label
                  key={task.id}
                  className="flex items-center gap-2 border-b border-jira-borderSoft px-3 py-1.5 text-sm last:border-b-0 hover:bg-jira-hover"
                  style={{ paddingLeft: 12 + depth * 20 }}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={selected.has(task.id)}
                    disabled={disabled}
                    onChange={() => toggle(task.id)}
                  />
                  <span className={`flex-1 truncate ${disabled ? "text-jira-textSub" : "text-jira-text"}`}>
                    {task.name}
                  </span>
                  {task.is_milestone && (
                    <span className="shrink-0 text-xs text-jira-textSub">
                      {t("projects.overview.roadmap.pickerMilestoneDisabledHint")}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-jira-borderSoft pt-3">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>
            {t("projects.overview.roadmap.pickerCancel")}
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving
              ? t("projects.overview.roadmap.pickerSaving")
              : t("projects.overview.roadmap.pickerSave")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
