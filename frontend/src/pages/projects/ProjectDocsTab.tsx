import { useEffect, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useSpaces } from "@/hooks/useSpaces";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Button } from "@/components/common/Button";
import { CreateSpaceModal } from "@/components/docs/CreateSpaceModal";

/** Entry point for a project's Documentación tab. A project can have more
 * than one space (no uniqueness enforced server-side), but the common case
 * is exactly one — this auto-selects it so most users never see a picker. */
export function ProjectDocsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { project } = useProjectDetailContext();
  const { spaceId } = useParams<{ spaceId?: string }>();
  const { data, isLoading, error } = useSpaces({ project_id: project.id });
  const [showCreate, setShowCreate] = useState(false);
  const spaces = data?.items ?? [];

  useEffect(() => {
    if (!spaceId && spaces.length === 1) {
      navigate(spaces[0].id, { replace: true });
    }
    // Only re-run when the space list itself changes — not on every
    // spaceId change, which would fight in-tab navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces.length]);

  if (spaceId) return <Outlet context={{ project }} />;

  return (
    <div>
      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {!isLoading && spaces.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-jira-textSub">{t("projects.overview.docs.noSpacesForProject")}</p>
          <Button variant="primary" iconLeft={Plus} onClick={() => setShowCreate(true)}>
            {t("projects.overview.docs.createSpace")}
          </Button>
        </div>
      )}

      {spaces.length > 1 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {spaces.map((space) => (
            <button
              key={space.id}
              type="button"
              className="card flex items-center gap-3 p-4 text-left hover:bg-jira-hover"
              onClick={() => navigate(space.id)}
            >
              <span className="text-2xl">{space.icon ?? "📄"}</span>
              <div className="min-w-0">
                <p className="truncate font-medium text-jira-text">{space.name}</p>
                {space.description && (
                  <p className="truncate text-xs text-jira-textSub">{space.description}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateSpaceModal
          fixedProjectId={project.id}
          onClose={() => setShowCreate(false)}
          onCreated={(newSpaceId) => {
            setShowCreate(false);
            navigate(newSpaceId);
          }}
        />
      )}
    </div>
  );
}
