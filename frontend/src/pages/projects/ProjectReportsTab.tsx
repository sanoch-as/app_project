import { useState } from "react";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { downloadProjectExport } from "@/api/reportsExport";
import { getApiErrorMessage } from "@/api/client";
import type { ExportType } from "@/types/api";

const EXPORTS: { type: ExportType; label: string; description: string; extension: string }[] = [
  {
    type: "tasks",
    label: "Tasks (CSV)",
    description: "Every task with WBS, dates, status, priority, cost and CPM fields.",
    extension: "csv",
  },
  {
    type: "worklogs",
    label: "Worklogs (CSV)",
    description: "Every logged hour on this project, with user, date and description.",
    extension: "csv",
  },
  {
    type: "summary",
    label: "Project summary (PDF)",
    description: "A one-page PDF with KPIs and S-curve numbers.",
    extension: "pdf",
  },
];

export function ProjectReportsTab() {
  const { project } = useProjectDetailContext();
  const [pending, setPending] = useState<ExportType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(type: ExportType, extension: string) {
    setPending(type);
    setError(null);
    try {
      const safeName = project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      await downloadProjectExport(project.id, type, `${safeName}-${type}.${extension}`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">Export reports</h2>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {EXPORTS.map((exp) => (
          <div key={exp.type} className="card flex flex-col justify-between p-4">
            <div>
              <h3 className="font-medium text-slate-800">{exp.label}</h3>
              <p className="mt-1 text-sm text-slate-500">{exp.description}</p>
            </div>
            <button
              type="button"
              className="btn-primary mt-4"
              disabled={pending === exp.type}
              onClick={() => handleDownload(exp.type, exp.extension)}
            >
              {pending === exp.type ? "Downloading…" : "Download"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
