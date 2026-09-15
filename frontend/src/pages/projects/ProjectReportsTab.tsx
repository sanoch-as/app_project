import { useState } from "react";
import { Clock, Download, FileText, ListChecks, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { downloadProjectExport } from "@/api/reportsExport";
import { getApiErrorMessage } from "@/api/client";
import { Button } from "@/components/common/Button";
import type { ExportType } from "@/types/api";

export function ProjectReportsTab() {
  const { t } = useTranslation();
  const EXPORTS: { type: ExportType; label: string; description: string; extension: string; icon: LucideIcon }[] = [
    {
      type: "tasks",
      label: t("reports.tasksCsvLabel"),
      description: t("reports.tasksCsvDescription"),
      extension: "csv",
      icon: ListChecks,
    },
    {
      type: "worklogs",
      label: t("reports.worklogsCsvLabel"),
      description: t("reports.worklogsCsvDescription"),
      extension: "csv",
      icon: Clock,
    },
    {
      type: "summary",
      label: t("reports.summaryPdfLabel"),
      description: t("reports.summaryPdfDescription"),
      extension: "pdf",
      icon: FileText,
    },
  ];
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
      <h2 className="text-sm font-semibold text-jira-text">{t("reports.exportReports")}</h2>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-jira-red">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {EXPORTS.map((exp) => (
          <div key={exp.type} className="card flex flex-col justify-between p-4">
            <div>
              <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-jira-blueBadgeBg">
                <exp.icon className="h-4 w-4 text-jira-blueBadgeText" aria-hidden="true" />
              </span>
              <h3 className="font-medium text-jira-text">{exp.label}</h3>
              <p className="mt-1 text-sm text-jira-textSub">{exp.description}</p>
            </div>
            <Button
              variant="primary"
              iconLeft={Download}
              className="mt-4"
              loading={pending === exp.type}
              onClick={() => handleDownload(exp.type, exp.extension)}
            >
              {pending === exp.type ? t("reports.downloading") : t("reports.download")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
