import { useState, type FormEvent } from "react";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useAuthStore } from "@/store/authStore";
import { useBaselines, useCreateBaseline } from "@/hooks/useBaselines";
import { useGantt } from "@/hooks/useTasks";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Modal } from "@/components/common/Modal";

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
        <h2 className="text-sm font-semibold text-slate-700">Baselines</h2>
        {role === "admin" && (
          <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
            + Save baseline
          </button>
        )}
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {sortedBaselines.length === 0 ? (
        <div className="card p-6 text-sm text-slate-500">
          No baselines yet. {role === "admin" ? "Save one to establish planned value (PV)." : "Ask an admin to save one."}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {sortedBaselines.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBaselineId(b.id)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  (selected?.id ?? sortedBaselines[0].id) === b.id
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {b.name}
                <span className="ml-1.5 text-xs text-slate-400">
                  {new Date(b.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="card overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
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
                <tbody className="divide-y divide-slate-100">
                  {selected.baseline_tasks.map((bt) => {
                    const current = taskById.get(bt.task_id);
                    const startSlip = current && current.start_date !== bt.planned_start_date;
                    const endSlip = current && current.end_date !== bt.planned_end_date;
                    const costOver = current && current.budgeted_cost > bt.planned_cost;
                    return (
                      <tr key={bt.task_id}>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {current ? `${current.wbs_code} ${current.name}` : bt.task_id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2">{bt.planned_start_date}</td>
                        <td className={`px-3 py-2 ${startSlip ? "font-medium text-amber-700" : ""}`}>
                          {current?.start_date ?? "—"}
                        </td>
                        <td className="px-3 py-2">{bt.planned_end_date}</td>
                        <td className={`px-3 py-2 ${endSlip ? "font-medium text-amber-700" : ""}`}>
                          {current?.end_date ?? "—"}
                        </td>
                        <td className="px-3 py-2">{currencyFormatter.format(bt.planned_cost)}</td>
                        <td className={`px-3 py-2 ${costOver ? "font-medium text-red-700" : ""}`}>
                          {current ? currencyFormatter.format(current.budgeted_cost) : "—"}
                        </td>
                        <td className="px-3 py-2">{current?.percent_complete ?? "—"}%</td>
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
            <p className="text-xs text-slate-400">
              Snapshots every task's current start/end date and budgeted cost. This becomes the
              new reference for planned value (PV) in the S-curve.
            </p>
            <ErrorMessage error={createBaseline.error} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={createBaseline.isPending}>
                {createBaseline.isPending ? "Saving…" : "Save baseline"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
