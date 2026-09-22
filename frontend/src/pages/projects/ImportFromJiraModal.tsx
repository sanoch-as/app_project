import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { useImportJiraCsv } from "@/hooks/useJiraImport";

interface ImportFromJiraModalProps {
  projectId?: string;
  onClose: () => void;
}

export function ImportFromJiraModal({ projectId, onClose }: ImportFromJiraModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const importJiraCsv = useImportJiraCsv(projectId);

  const [projectName, setProjectName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (importJiraCsv.data || !file) return;
    importJiraCsv.mutate({ file, projectName: projectId ? undefined : projectName });
  }

  const result = importJiraCsv.data;

  return (
    <Modal title={t("jiraImport.title")} onClose={onClose} widthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {!projectId && (
          <div>
            <label className="label" htmlFor="jira_import_project_name">
              {t("jiraImport.projectName")}
            </label>
            <input
              id="jira_import_project_name"
              required
              disabled={Boolean(result)}
              className="input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="jira_import_file">
            {t("jiraImport.file")}
          </label>
          <input
            id="jira_import_file"
            type="file"
            accept=".csv"
            required
            disabled={Boolean(result)}
            className="input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1 text-xs text-jira-textSub">{t("jiraImport.fileHint")}</p>
        </div>

        <ErrorMessage error={importJiraCsv.error} />

        {result && (
          <div className="rounded-md border border-jira-border bg-jira-hover/40 p-3 text-sm">
            <p className="font-medium text-jira-text">
              {t("jiraImport.result.summary", {
                created: result.created_count,
                updated: result.updated_count,
              })}
            </p>
            <p className="mt-1 text-jira-textSub">
              {t("jiraImport.result.dependenciesSummary", { count: result.dependency_count })}
            </p>
            {result.warnings.length > 0 && (
              <>
                <p className="mt-2 text-xs font-semibold text-jira-textSub">
                  {t("jiraImport.result.warningsTitle")}
                </p>
                <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-jira-textSub">
                  {result.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-jira-borderSoft pt-3">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {result ? t("common.close") : t("common.cancel")}
          </button>
          {result ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate(`/projects/${result.project_id}/overview`)}
            >
              {t("jiraImport.viewProject")}
            </button>
          ) : (
            <button
              type="submit"
              className="btn-primary"
              disabled={importJiraCsv.isPending || !file}
            >
              {importJiraCsv.isPending ? t("jiraImport.importing") : t("jiraImport.submit")}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
