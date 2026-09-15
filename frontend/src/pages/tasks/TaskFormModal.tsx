import { useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/common/Modal";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { useCreateTask, useUpdateTask } from "@/hooks/useTasks";
import type { TaskCreate, TaskPriority, TaskRead, TaskUpdate, UserRead } from "@/types/api";

interface TaskFormModalProps {
  projectId: string;
  initial?: TaskRead;
  allTasks: TaskRead[];
  members: UserRead[];
  onClose: () => void;
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

interface AssigneeRow {
  userId: string;
  selected: boolean;
  allocation: number;
}

export function TaskFormModal({ projectId, initial, allTasks, members, onClose }: TaskFormModalProps) {
  const createTask = useCreateTask(projectId);
  const updateTask = useUpdateTask(projectId);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [parentTaskId, setParentTaskId] = useState(initial?.parent_task_id ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? new Date().toISOString().slice(0, 10));
  const [durationDays, setDurationDays] = useState(initial?.duration_days ?? 1);
  const [isMilestone, setIsMilestone] = useState(initial?.is_milestone ?? false);
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? "medium");
  const [estimatedHours, setEstimatedHours] = useState(
    initial?.estimated_hours != null ? String(initial.estimated_hours) : "",
  );
  const [budgetedCost, setBudgetedCost] = useState(String(initial?.budgeted_cost ?? 0));

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

    const shared = {
      name,
      description: description.trim() === "" ? null : description,
      start_date: startDate,
      duration_days: isMilestone ? 0 : Number(durationDays),
      is_milestone: isMilestone,
      priority,
      estimated_hours: estimatedHours === "" ? null : Number(estimatedHours),
      budgeted_cost: Number(budgetedCost),
      assignees: assigneePayload,
    };

    if (initial) {
      const payload: TaskUpdate = shared;
      updateTask.mutate(
        { taskId: initial.id, payload },
        { onSuccess: () => onClose() },
      );
    } else {
      const payload: TaskCreate = {
        ...shared,
        parent_task_id: parentTaskId === "" ? null : parentTaskId,
      };
      createTask.mutate(payload, { onSuccess: () => onClose() });
    }
  }

  return (
    <Modal title={initial ? `Edit task — ${initial.wbs_code}` : "New task"} onClose={onClose} widthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="task_name">
            Name
          </label>
          <input
            id="task_name"
            required
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="task_description">
            Description
          </label>
          <textarea
            id="task_description"
            rows={2}
            className="input"
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {!initial && (
          <div>
            <label className="label" htmlFor="parent_task">
              WBS parent
            </label>
            <select
              id="parent_task"
              className="input"
              value={parentTaskId}
              onChange={(e) => setParentTaskId(e.target.value)}
            >
              <option value="">(top level)</option>
              {parentOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.wbs_code} — {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="start_date">
              Start date
            </label>
            <input
              id="start_date"
              type="date"
              required
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="duration_days">
              Duration (working days)
            </label>
            <input
              id="duration_days"
              type="number"
              min={0}
              required
              disabled={isMilestone}
              className="input disabled:bg-slate-100"
              value={isMilestone ? 0 : durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-400">
          End date is computed by the server from start date + duration using the project's
          working calendar — it is never entered directly.
        </p>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isMilestone}
            onChange={(e) => setIsMilestone(e.target.checked)}
          />
          This is a milestone (0-duration marker)
        </label>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="priority">
              Priority
            </label>
            <select
              id="priority"
              className="input"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="estimated_hours">
              Estimated hours
            </label>
            <input
              id="estimated_hours"
              type="number"
              min={0}
              step={0.5}
              className="input"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="budgeted_cost">
              Budgeted cost
            </label>
            <input
              id="budgeted_cost"
              type="number"
              min={0}
              step={0.01}
              className="input"
              value={budgetedCost}
              onChange={(e) => setBudgetedCost(e.target.value)}
            />
          </div>
        </div>

        <div>
          <span className="label">Assignees</span>
          {members.length === 0 ? (
            <p className="text-sm text-slate-400">
              No members on this project yet — add some in the Members tab.
            </p>
          ) : (
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-slate-200 p-2">
              {assignees.map((row) => {
                const member = members.find((m) => m.id === row.userId)!;
                return (
                  <div key={row.userId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={() => toggleAssignee(row.userId)}
                    />
                    <span className="flex-1">{member.full_name}</span>
                    {row.selected && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
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

        <ErrorMessage error={mutation.error} />

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? "Saving…" : initial ? "Save changes" : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
