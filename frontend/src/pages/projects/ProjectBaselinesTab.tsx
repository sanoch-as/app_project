import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useAuthStore } from "@/store/authStore";
import { useBaselines, useCreateBaseline } from "@/hooks/useBaselines";
import { useGantt } from "@/hooks/useTasks";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function ProjectBaselinesTab() {
  const { project } = useProjectDetailContext();
  const role = useAuthStore((s) => s.user?.role);
  const { data: baselines, isLoading, error } = useBaselines(project.id);
  const { data: gantt } = useGantt(project.id);
  const createBaseline = useCreateBaseline(project.id);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null);

  const sortedBaselines = [...(baselines?.items ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const selected = sortedBaselines.find((b) => b.id === selectedBaselineId) ?? sortedBaselines[0];
  const taskById = new Map((gantt?.tasks ?? []).map((t) => [t.id, t]));

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createBaseline.mutate(
      { name: name || `Baseline ${new Date().toISOString().slice(0, 10)}` },
      { onSuccess: () => { setShowCreate(false); setName(""); } },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-jira-text">Baselines</h2>
        {role === "admin" && (
          <Button variant="primary" iconLeft={Plus} onClick={() => setShowCreate(true)}>
            Save baseline
          </Button>
        )}
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {sortedBaselines.length === 0 ? (
        <div className="card p-6 text-sm text-jira-textSub">
          No baselines yet. {role === "admin" ? "Save one to establish planned value (PV)." : "Ask an admin to save one."}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {sortedBaselines.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBaselineId(b.id)}
                className={clsx(
                  "rounded-md border px-3 py-1.5 text-sm",
                  (selected?.id ?? sortedBaselines[0].id) === b.id
                    ? "border-brand-500 bg-jira-blueBadgeBg text-brand-700"
                    : "border-jira-border bg-white text-jira-textSub hover:bg-jira-hover",
                )}
              >
                {b.name}
                <span className="ml-1.5 text-xs text-jira-textSub">
                  {new Date(b.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="card overflow-x-auto">
              <table className="min-w-full divide-y divide-jira-border text-sm">
                <thead className="bg-jira-panel">
                  <tr className="text-left text-xs font-bold uppercase tracking-wide text-jira-textSub">
                    <th className="px-3 py-2">Task</th>
                    <th className="px-3 py-2">Planned start</th>
                    <th className="px-3 py-2">Current start</th>
                    <th className="px-3 py-2">Planned end</th>
                    <th className="px-3 py-2">Current end</th>
                    <th className="px-3 py-2">Planned cost</th>
                    <th className="px-3 py-2">Current cost</th>
                    <th className="px-3 py-2">% Done</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-jira-borderSoft">
                  {selected.baseline_tasks.map((bt) => {
                    const current = taskById.get(bt.task_id);
                    const startSlip = current && current.start_date !== bt.planned_start_date;
                    const endSlip = current && current.end_date !== bt.planned_end_date;
                    const costOver = current && current.budgeted_cost > bt.planned_cost;
                    return (
                      <tr key={bt.task_id} className="hover:bg-jira-hover">
                        <td className="px-3 py-2 font-medium text-jira-text">
                          {current ? `${current.wbs_code} ${current.name}` : bt.task_id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 text-jira-textSub">{bt.planned_start_date}</td>
                        <td className={`px-3 py-2 ${startSlip ? "font-medium text-jira-orange" : "text-jira-textSub"}`}>
                          {current?.start_date ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-jira-textSub">{bt.planned_end_date}</td>
                        <td className={`px-3 py-2 ${endSlip ? "font-medium text-jira-orange" : "text-jira-textSub"}`}>
                          {current?.end_date ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-jira-textSub">{currencyFormatter.format(bt.planned_cost)}</td>
                        <td className={`px-3 py-2 ${costOver ? "font-medium text-jira-red" : "text-jira-textSub"}`}>
                          {current ? currencyFormatter.format(current.budgeted_cost) : "—"}
                        </td>
                        <td className="px-3 py-2 text-jira-textSub">{current?.percent_complete ?? "—"}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <Modal title="Save baseline" onClose={() => setShowCreate(false)} widthClassName="max-w-sm">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label" htmlFor="baseline_name">
                Name
              </label>
              <input
                id="baseline_name"
                className="input"
                placeholder="e.g. Baseline 1 — kickoff plan"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <p className="text-xs text-jira-textSub">
              Snapshots every task's current start/end date and budgeted cost. This becomes the
              new reference for planned value (PV) in the S-curve.
            </p>
            <ErrorMessage error={createBaseline.error} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={createBaseline.isPending}>
                {createBaseline.isPending ? "Saving…" : "Save baseline"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
