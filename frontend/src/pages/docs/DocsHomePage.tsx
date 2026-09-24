import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSpaces } from "@/hooks/useSpaces";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Button } from "@/components/common/Button";
import { CreateSpaceModal } from "@/components/docs/CreateSpaceModal";

export function DocsHomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, error } = useSpaces({ limit: 100 });
  const [showCreate, setShowCreate] = useState(false);
  const spaces = data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-jira-text">{t("nav.docs")}</h1>
        <Button variant="primary" iconLeft={Plus} onClick={() => setShowCreate(true)}>
          {t("projects.overview.docs.createSpace")}
        </Button>
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {!isLoading && spaces.length === 0 && (
        <p className="text-sm text-jira-textSub">{t("projects.overview.docs.noSpaces")}</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {spaces.map((space) => (
          <button
            key={space.id}
            type="button"
            className="card flex items-center gap-3 p-4 text-left hover:bg-jira-hover"
            onClick={() => navigate(`/docs/${space.id}`)}
          >
            <span className="text-2xl">{space.icon ?? "📄"}</span>
            <div className="min-w-0">
              <p className="truncate font-medium text-jira-text">{space.name}</p>
              {space.description && (
                <p className="truncate text-xs text-jira-textSub">{space.description}</p>
              )}
              <p className="text-xs text-jira-textSub">
                {space.project_id
                  ? t("projects.overview.docs.projectSpace")
                  : t("projects.overview.docs.independentSpace")}
              </p>
            </div>
          </button>
        ))}
      </div>

      {showCreate && (
        <CreateSpaceModal
          onClose={() => setShowCreate(false)}
          onCreated={(spaceId) => {
            setShowCreate(false);
            navigate(`/docs/${spaceId}`);
          }}
        />
      )}
    </div>
  );
}
