import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
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

const DEP_TYPES: DependencyType[] = ["FS", "SS", "FF", "SF"];

type Direction = "blocks" | "depends_on";

export function DependencyManager({ projectId, task, allTasks, dependencies, onClose }: DependencyManagerProps) {
  const { t } = useTranslation();
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
    <Modal title={t("tasks.dependencies.title", { wbs: task.wbs_code, name: task.name })} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-jira-text">
            {t("tasks.dependencies.currentDependencies")}
          </h3>
          {related.length === 0 ? (
            <p className="text-sm text-jira-textSub">{t("tasks.dependencies.noDependenciesYet")}</p>
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
                      {isPredecessor ? t("tasks.dependencies.blocks") : t("tasks.dependencies.dependsOn")}{" "}
                      <strong>
                        {other ? `${other.wbs_code} ${other.name}` : t("tasks.dependencies.unknownTask")}
                      </strong>{" "}
                      <span className="text-xs text-jira-textSub">
                        ({dep.dependency_type}
                        {dep.lag_days !== 0 && t("tasks.dependencies.lag", { days: dep.lag_days })})
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-xs font-medium text-jira-red hover:underline"
                      onClick={() => removeDependency.mutate(dep.id)}
                      disabled={removeDependency.isPending}
                    >
                      {t("tasks.dependencies.remove")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <form onSubmit={handleAdd} className="space-y-3 border-t border-jira-borderSoft pt-4">
          <h3 className="text-sm font-semibold text-jira-text">{t("tasks.dependencies.addDependency")}</h3>
          <div className="flex gap-2">
            <select
              className="input"
              value={direction}
              onChange={(e) => setDirection(e.target.value as Direction)}
            >
              <option value="depends_on">{t("tasks.dependencies.thisTaskDependsOn")}</option>
              <option value="blocks">{t("tasks.dependencies.thisTaskBlocks")}</option>
            </select>
            <select
              className="input"
              value={otherTaskId}
              onChange={(e) => setOtherTaskId(e.target.value)}
              required
            >
              <option value="">{t("tasks.dependencies.selectTask")}</option>
              {otherOptions.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.wbs_code} — {task.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="dep_type">
                {t("tasks.dependencies.type")}
              </label>
              <select
                id="dep_type"
                className="input"
                value={depType}
                onChange={(e) => setDepType(e.target.value as DependencyType)}
              >
                {DEP_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`enums.dependencyType.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="lag_days">
                {t("tasks.dependencies.lagDays")}
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
              {addDependency.isPending ? t("tasks.dependencies.adding") : t("tasks.dependencies.addDependency")}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
