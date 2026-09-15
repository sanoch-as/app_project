import { useState, type FormEvent } from "react";
import { Modal } from "@/components/common/Modal";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { useAddDependency, useRemoveDependency } from "@/hooks/useTasks";
import type { DependencyRead, DependencyType, TaskRead } from "@/types/api";

interface DependencyManagerProps {
  projectId: string;
  task: TaskRead;
  allTasks: TaskRead[];
  dependencies: DependencyRead[];
  onClose: () => void;
}

const DEP_TYPES: { value: DependencyType; label: string }[] = [
  { value: "FS", label: "Finish-to-Start (FS)" },
  { value: "SS", label: "Start-to-Start (SS)" },
  { value: "FF", label: "Finish-to-Finish (FF)" },
  { value: "SF", label: "Start-to-Finish (SF)" },
];

type Direction = "blocks" | "depends_on";

export function DependencyManager({ projectId, task, allTasks, dependencies, onClose }: DependencyManagerProps) {
  const addDependency = useAddDependency(projectId);
  const removeDependency = useRemoveDependency(projectId);

  const [direction, setDirection] = useState<Direction>("depends_on");
  const [otherTaskId, setOtherTaskId] = useState("");
  const [depType, setDepType] = useState<DependencyType>("FS");
  const [lagDays, setLagDays] = useState(0);

  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const related = dependencies.filter(
    (d) => d.predecessor_id === task.id || d.successor_id === task.id,
  );
  const otherOptions = allTasks.filter((t) => t.id !== task.id);

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!otherTaskId) return;
    if (direction === "depends_on") {
      // task depends on otherTask -> otherTask is predecessor, task is successor
      addDependency.mutate({
        taskId: otherTaskId,
        payload: { successor_id: task.id, dependency_type: depType, lag_days: lagDays },
      });
    } else {
      // task blocks otherTask -> task is predecessor, otherTask is successor
      addDependency.mutate({
        taskId: task.id,
        payload: { successor_id: otherTaskId, dependency_type: depType, lag_days: lagDays },
      });
    }
    setOtherTaskId("");
    setLagDays(0);
  }

  return (
    <Modal title={`Dependencies — ${task.wbs_code} ${task.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-jira-text">Current dependencies</h3>
          {related.length === 0 ? (
            <p className="text-sm text-jira-textSub">No dependencies yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {related.map((dep) => {
                const isPredecessor = dep.predecessor_id === task.id;
                const other = taskById.get(isPredecessor ? dep.successor_id : dep.predecessor_id);
                return (
                  <li
                    key={dep.id}
                    className="flex items-center justify-between rounded-md border border-jira-border px-3 py-2 text-sm text-jira-text"
                  >
                    <span>
                      {isPredecessor ? "Blocks" : "Depends on"}{" "}
                      <strong>{other ? `${other.wbs_code} ${other.name}` : "Unknown task"}</strong>{" "}
                      <span className="text-xs text-jira-textSub">
                        ({dep.dependency_type}
                        {dep.lag_days !== 0 ? `, lag ${dep.lag_days}d` : ""})
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-xs font-medium text-jira-red hover:underline"
                      onClick={() => removeDependency.mutate(dep.id)}
                      disabled={removeDependency.isPending}
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <form onSubmit={handleAdd} className="space-y-3 border-t border-jira-borderSoft pt-4">
          <h3 className="text-sm font-semibold text-jira-text">Add dependency</h3>
          <div className="flex gap-2">
            <select
              className="input"
              value={direction}
              onChange={(e) => setDirection(e.target.value as Direction)}
            >
              <option value="depends_on">This task depends on…</option>
              <option value="blocks">This task blocks…</option>
            </select>
            <select
              className="input"
              value={otherTaskId}
              onChange={(e) => setOtherTaskId(e.target.value)}
              required
            >
              <option value="">Select task…</option>
              {otherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.wbs_code} — {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="dep_type">
                Type
              </label>
              <select
                id="dep_type"
                className="input"
                value={depType}
                onChange={(e) => setDepType(e.target.value as DependencyType)}
              >
                {DEP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="lag_days">
                Lag (days)
              </label>
              <input
                id="lag_days"
                type="number"
                className="input"
                value={lagDays}
                onChange={(e) => setLagDays(Number(e.target.value))}
              />
            </div>
          </div>
          <ErrorMessage error={addDependency.error ?? removeDependency.error} />
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={addDependency.isPending}>
              {addDependency.isPending ? "Adding…" : "Add dependency"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
