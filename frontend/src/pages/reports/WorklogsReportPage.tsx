import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import { useUsers } from "@/hooks/useUsers";
import { useWorklogsReport } from "@/hooks/useWorklogs";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Button } from "@/components/common/Button";
import { downloadProjectExport } from "@/api/reportsExport";
import { getApiErrorMessage } from "@/api/client";

export function WorklogsReportPage() {
  const { data: projects } = useProjects({ limit: 100 });
  const { data: users } = useUsers({ limit: 100 });

  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, isLoading, error } = useWorklogsReport({
    project_id: projectId || undefined,
    user_id: userId || undefined,
    from: from || undefined,
    to: to || undefined,
    limit: 100,
  });

  const userNameById = useMemo(
    () => new Map((users?.items ?? []).map((u) => [u.id, u.full_name])),
    [users],
  );

  const totalHours = (data?.items ?? []).reduce((sum, w) => sum + w.hours, 0);

  async function handleExport() {
    if (!projectId) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadProjectExport(projectId, "worklogs", "worklogs.csv");
    } catch (err) {
      setExportError(getApiErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-jira-text">Worklogs report</h1>
      <p className="mb-6 text-sm text-jira-textSub">
        Hours logged across projects, filterable by project, user and date range.
      </p>

      <div className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
        <div>
          <label className="label">Project</label>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {(projects?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">User</label>
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">All users</option>
            {(users?.items ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-jira-textSub">
          {data ? `${data.total} entr${data.total === 1 ? "y" : "ies"} · ${totalHours.toFixed(2)}h total` : ""}
        </div>
        <div className="flex items-center gap-2">
          {exportError && <ErrorMessage error={exportError} />}
          <Button
            variant="secondary"
            iconLeft={Download}
            disabled={!projectId || exporting}
            title={!projectId ? "Select a single project to export its worklogs as CSV" : undefined}
            onClick={handleExport}
          >
            {exporting ? "Exporting…" : "Export CSV (selected project)"}
          </Button>
        </div>
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {data && (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-jira-border text-sm">
            <thead className="bg-jira-panel">
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-jira-textSub">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-jira-borderSoft">
              {data.items.map((w) => (
                <tr key={w.id} className="hover:bg-jira-hover">
                  <td className="px-3 py-2 text-jira-text">{w.work_date}</td>
                  <td className="px-3 py-2 text-jira-text">{userNameById.get(w.user_id) ?? w.user_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-jira-text">{w.hours}</td>
                  <td className="px-3 py-2 text-jira-textSub">{w.description ?? "—"}</td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-jira-textSub">
                    No worklogs match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
