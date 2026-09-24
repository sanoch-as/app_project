import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { useCreateSpace } from "@/hooks/useSpaces";
import { useProjects } from "@/hooks/useProjects";

interface CreateSpaceModalProps {
  /** Pre-selects and locks the "tied to project" option, e.g. when opened
   * from a project's Documentación tab. */
  fixedProjectId?: string;
  onClose: () => void;
  onCreated: (spaceId: string) => void;
}

export function CreateSpaceModal({ fixedProjectId, onClose, onCreated }: CreateSpaceModalProps) {
  const { t } = useTranslation();
  const createSpace = useCreateSpace();
  const { data: projects } = useProjects({ limit: 100 });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("📁");
  const [tied, setTied] = useState(Boolean(fixedProjectId));
  const [projectId, setProjectId] = useState(fixedProjectId ?? "");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const space = await createSpace.mutateAsync({
      name,
      description: description || null,
      icon: icon || null,
      project_id: tied ? projectId || null : null,
    });
    onCreated(space.id);
  }

  return (
    <Modal title={t("projects.overview.docs.createSpace")} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="space-name">
            {t("projects.overview.docs.spaceName")}
          </label>
          <input
            id="space-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={255}
          />
        </div>
        <div>
          <label className="label" htmlFor="space-description">
            {t("projects.overview.docs.spaceDescription")}
          </label>
          <textarea
            id="space-description"
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </div>
        <div>
          <label className="label" htmlFor="space-icon">
            {t("projects.overview.docs.spaceIcon")}
          </label>
          <input
            id="space-icon"
            className="input w-20 text-center text-lg"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={8}
          />
        </div>

        {!fixedProjectId && (
          <div className="space-y-2">
            <span className="label mb-0">{t("projects.overview.docs.spaceType")}</span>
            <label className="flex items-center gap-2 text-sm text-jira-text">
              <input
                type="radio"
                name="space-type"
                checked={!tied}
                onChange={() => setTied(false)}
              />
              {t("projects.overview.docs.spaceTypeIndependent")}
            </label>
            <label className="flex items-center gap-2 text-sm text-jira-text">
              <input type="radio" name="space-type" checked={tied} onChange={() => setTied(true)} />
              {t("projects.overview.docs.spaceTypeProject")}
            </label>
            {tied && (
              <select
                className="input"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required={tied}
              >
                <option value="">{t("projects.overview.docs.selectProject")}</option>
                {(projects?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <ErrorMessage error={createSpace.error} />

        <div className="flex justify-end gap-2 border-t border-jira-borderSoft pt-3">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={createSpace.isPending || (tied && !projectId)}
          >
            {createSpace.isPending
              ? t("common.saving")
              : t("projects.overview.docs.createSpace")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
