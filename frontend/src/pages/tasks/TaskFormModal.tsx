import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { useCreateTask, useUpdateTask } from "@/hooks/useTasks";
import { JIRA_PROJECT_ROOT_KEY } from "@/lib/jiraImport";
import { CommentThread } from "@/pages/tasks/CommentThread";
import { TaskBreadcrumb } from "@/pages/tasks/TaskBreadcrumb";
import type { TaskCreate, TaskPriority, TaskRead, TaskUpdate, UserRead } from "@/types/api";

interface TaskFormModalProps {
  projectId: string;
  initial?: TaskRead;
  allTasks: TaskRead[];
  members: UserRead[];
  onClose: () => void;
  onNavigate?: (taskId: string) => void;
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

interface AssigneeRow {
  userId: string;
  selected: boolean;
  allocation: number;
}

/** One "label: value" row in the sidebar, Jira-style — label at a fixed
 * width, value flexible, generous vertical padding instead of borders. */
function DetailRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const labelClassName = "pt-1.5 text-xs font-medium text-jira-textSub";
  return (
    <div className="grid grid-cols-[104px_1fr] items-start gap-3 py-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClassName}>
          {label}
        </label>
      ) : (
        <span className={labelClassName}>{label}</span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TaskFormModal({
  projectId,
  initial,
  allTasks,
  members,
  onClose,
  onNavigate,
}: TaskFormModalProps) {
  const { t } = useTranslation();
  const createTask = useCreateTask(projectId);
  const updateTask = useUpdateTask(projectId);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [parentTaskId, setParentTaskId] = useState(initial?.parent_task_id ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? new Date().toISOString().slice(0, 10));
  const [durationDays, setDurationDays] = useState(initial?.duration_days ?? 1);
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  // Which of duration/end date the user edited most recently — only that one
  // is sent on save, letting the server derive the other (services/task_service.py).
  const [lastDateFieldTouched, setLastDateFieldTouched] = useState<"duration" | "endDate">(
    "duration",
  );
  const [isMilestone, setIsMilestone] = useState(initial?.is_milestone ?? false);
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? "medium");
  const [estimatedHours, setEstimatedHours] = useState(
    initial?.estimated_hours != null ? String(initial.estimated_hours) : "",
  );
  const [budgetedCost, setBudgetedCost] = useState(String(initial?.budgeted_cost ?? 0));
  const [percentComplete, setPercentComplete] = useState(initial?.percent_complete ?? 0);

  const [assignees, setAssignees] = useState<AssigneeRow[]>(() =>
    members.map((m) => {
      const existing = initial?.assignees.find((a) => a.user.id === m.id);
      return {
        userId: m.id,
        selected: Boolean(existing),
        allocation: existing?.allocation_percent ?? 100,
      };
    }),
  );

  const parentOptions = useMemo(
    () => allTasks.filter((t) => t.id !== initial?.id),
    [allTasks, initial?.id],
  );
  const hasChildren = useMemo(
    () => Boolean(initial) && allTasks.some((t) => t.parent_task_id === initial?.id),
    [allTasks, initial],
  );

  const mutation = initial ? updateTask : createTask;
  const isPending = mutation.isPending;

  function toggleAssignee(userId: string) {
    setAssignees((rows) =>
      rows.map((r) => (r.userId === userId ? { ...r, selected: !r.selected } : r)),
    );
  }

  function setAllocation(userId: string, value: number) {
    setAssignees((rows) =>
      rows.map((r) => (r.userId === userId ? { ...r, allocation: value } : r)),
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const assigneePayload = assignees
      .filter((r) => r.selected)
      .map((r) => ({ user_id: r.userId, allocation_percent: r.allocation }));

    const base = {
      name,
      description: description.trim() === "" ? null : description,
      is_milestone: isMilestone,
      priority,
      estimated_hours: estimatedHours === "" ? null : Number(estimatedHours),
      assignees: assigneePayload,
    };

    if (initial) {
      // A task with subtasks has its dates/cost computed by roll-up — those
      // fields are read-only and must not be sent (the server rejects them).
      const payload: TaskUpdate = hasChildren
        ? base
        : {
            ...base,
            start_date: startDate,
            budgeted_cost: Number(budgetedCost),
            percent_complete: Number(percentComplete),
            ...(isMilestone
              ? { duration_days: 0 }
              : lastDateFieldTouched === "endDate"
                ? { end_date: endDate }
                : { duration_days: Number(durationDays) }),
          };
      updateTask.mutate(
        { taskId: initial.id, payload },
        { onSuccess: () => onClose() },
      );
    } else {
      const payload: TaskCreate = {
        ...base,
        start_date: startDate,
        duration_days: isMilestone ? 0 : Number(durationDays),
        budgeted_cost: Number(budgetedCost),
        parent_task_id: parentTaskId === "" ? null : parentTaskId,
      };
      createTask.mutate(payload, { onSuccess: () => onClose() });
    }
  }

  return (
    <Modal
      title={
        initial
          ? t("tasks.form.editTitle", { wbs: initial.wbs_code })
          : t("tasks.form.newTitle")
      }
      onClose={onClose}
      widthClassName="max-w-5xl"
    >
      {initial && onNavigate && (
        <TaskBreadcrumb task={initial} allTasks={allTasks} onNavigate={onNavigate} />
      )}
      {initial?.external_key && (
        <span
          className="mb-3 inline-block rounded bg-jira-hover px-1.5 py-0.5 text-xs font-medium text-jira-textSub"
          title={
            initial.external_key === JIRA_PROJECT_ROOT_KEY
              ? t("tasks.form.projectSummaryTaskHint")
              : t("tasks.form.importedFromJira")
          }
        >
          {initial.external_key === JIRA_PROJECT_ROOT_KEY
            ? t("tasks.form.projectSummaryTask")
            : initial.external_key}
        </span>
      )}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_296px]">
          <div className="min-w-0 space-y-6">
            <input
              id="task_name"
              required
              placeholder={t("common.name")}
              aria-label={t("common.name")}
              className="w-full rounded-md border border-transparent bg-transparent px-1 text-xl font-semibold text-jira-text outline-none focus:border-jira-border focus:bg-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div>
              <label className="label" htmlFor="task_description">
                {t("common.description")}
              </label>
              <textarea
                id="task_description"
                rows={4}
                className="input"
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <aside className="space-y-1 lg:border-l lg:border-jira-borderSoft lg:pl-6">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-jira-textSub">
              {t("tasks.form.details")}
            </h3>

            {!initial && (
              <DetailRow label={t("tasks.form.wbsParent")} htmlFor="parent_task">
                <select
                  id="parent_task"
                  className="input"
                  value={parentTaskId}
                  onChange={(e) => setParentTaskId(e.target.value)}
                >
                  <option value="">{t("tasks.form.topLevel")}</option>
                  {parentOptions.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.wbs_code} — {task.name}
                    </option>
                  ))}
                </select>
              </DetailRow>
            )}

            <DetailRow label={t("tasks.table.priority")} htmlFor="priority">
              <select
                id="priority"
                className="input"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`enums.taskPriority.${p}`)}
                  </option>
                ))}
              </select>
            </DetailRow>

            <DetailRow label={t("common.startDate")} htmlFor="start_date">
              <input
                id="start_date"
                type="date"
                required
                disabled={hasChildren}
                className="input disabled:bg-jira-hover"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </DetailRow>

            <DetailRow label={t("tasks.form.durationDays")} htmlFor="duration_days">
              <input
                id="duration_days"
                type="number"
                min={0}
                required
                disabled={isMilestone || hasChildren}
                className="input disabled:bg-jira-hover"
                value={isMilestone ? 0 : durationDays}
                onChange={(e) => {
                  setDurationDays(Number(e.target.value));
                  setLastDateFieldTouched("duration");
                }}
              />
            </DetailRow>

            {initial && (
              <DetailRow label={t("tasks.form.endDate")} htmlFor="end_date">
                <input
                  id="end_date"
                  type="date"
                  required
                  disabled={isMilestone || hasChildren}
                  className="input disabled:bg-jira-hover"
                  value={isMilestone ? startDate : endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setLastDateFieldTouched("endDate");
                  }}
                />
              </DetailRow>
            )}
            <p className="pb-1 text-xs text-jira-textSub">
              {hasChildren ? t("tasks.form.rollupNotice") : t("tasks.form.endDateHint")}
            </p>

            <DetailRow label={t("tasks.form.milestoneLabel")}>
              <label className="flex items-center gap-2 pt-1.5 text-sm text-jira-text">
                <input
                  type="checkbox"
                  checked={isMilestone}
                  onChange={(e) => setIsMilestone(e.target.checked)}
                />
                {t("tasks.form.isMilestone")}
              </label>
            </DetailRow>

            <DetailRow label={t("tasks.form.estimatedHours")} htmlFor="estimated_hours">
              <input
                id="estimated_hours"
                type="number"
                min={0}
                step={0.5}
                className="input"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
              />
            </DetailRow>

            <DetailRow label={t("tasks.form.budgetedCost")} htmlFor="budgeted_cost">
              <input
                id="budgeted_cost"
                type="number"
                min={0}
                step={0.01}
                disabled={hasChildren}
                className="input disabled:bg-jira-hover"
                value={budgetedCost}
                onChange={(e) => setBudgetedCost(e.target.value)}
              />
            </DetailRow>

            {initial && (
              <DetailRow label={t("tasks.table.percentDone")} htmlFor="percent_complete">
                <input
                  id="percent_complete"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  disabled={hasChildren}
                  className="input disabled:bg-jira-hover"
                  value={percentComplete}
                  onChange={(e) => setPercentComplete(Number(e.target.value))}
                />
              </DetailRow>
            )}

            <div className="pt-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-jira-textSub">
                {t("tasks.form.assignees")}
              </h3>
              {members.length === 0 ? (
                <p className="text-sm text-jira-textSub">{t("tasks.form.noMembersYet")}</p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-jira-border p-2">
                  {assignees.map((row) => {
                    const member = members.find((m) => m.id === row.userId)!;
                    return (
                      <div key={row.userId} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => toggleAssignee(row.userId)}
                        />
                        <span className="flex-1 truncate text-jira-text">{member.full_name}</span>
                        {row.selected && (
                          <span className="flex items-center gap-1 text-xs text-jira-textSub">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="input w-16 py-0.5"
                              value={row.allocation}
                              onChange={(e) => setAllocation(row.userId, Number(e.target.value))}
                            />
                            %
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>

        <ErrorMessage error={mutation.error} />

        <div className="mt-8 flex justify-end gap-2 border-t border-jira-borderSoft pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending
              ? t("common.saving")
              : initial
                ? t("common.saveChanges")
                : t("tasks.form.createTask")}
          </button>
        </div>
      </form>

      {initial && (
        <div className="mt-6 border-t border-jira-borderSoft pt-5">
          <CommentThread taskId={initial.id} members={members} />
        </div>
      )}
    </Modal>
  );
}
