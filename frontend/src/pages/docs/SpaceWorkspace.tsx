import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSpace } from "@/hooks/useSpaces";
import { useCreatePage, useDeletePage, usePagesTree } from "@/hooks/usePages";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { PageTreeSidebar } from "@/components/docs/PageTreeSidebar";

/** Mounted at both `/docs/:spaceId` (global nav entry point) and
 * `/projects/:projectId/docs/:spaceId` (project tab entry point) — the two
 * share this one workspace instead of duplicating the tree/editor UI.
 * `projectId` is only present in `useParams()` when mounted under the
 * project-scoped route, which is what tells this component which base path
 * to build page links against. */
export function SpaceWorkspace() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { spaceId, pageId, projectId } = useParams<{
    spaceId: string;
    pageId?: string;
    projectId?: string;
  }>();
  const basePath = projectId ? `/projects/${projectId}/docs/${spaceId}` : `/docs/${spaceId}`;

  const { data: space, isLoading: spaceLoading, error: spaceError } = useSpace(spaceId);
  const { data: pages, isLoading: pagesLoading } = usePagesTree(spaceId);
  const createPage = useCreatePage(spaceId ?? "");
  const deletePage = useDeletePage(spaceId ?? "");

  async function handleCreatePage(parentPageId: string | null) {
    const page = await createPage.mutateAsync({
      parent_page_id: parentPageId,
      title: t("projects.overview.docs.untitledPage"),
    });
    navigate(`${basePath}/pages/${page.id}`);
  }

  async function handleDeletePage(deletedPageId: string) {
    await deletePage.mutateAsync(deletedPageId);
    if (deletedPageId === pageId) navigate(basePath);
  }

  if (spaceLoading) return <LoadingSpinner />;
  if (spaceError) return <ErrorMessage error={spaceError} />;
  if (!space) return null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {space.icon && <span className="text-xl">{space.icon}</span>}
        <h1 className="text-lg font-semibold text-jira-text">{space.name}</h1>
        {space.project_id && !projectId && (
          <Link
            to={`/projects/${space.project_id}`}
            className="text-xs text-jira-textSub hover:underline"
          >
            {t("projects.overview.docs.backToProject")}
          </Link>
        )}
      </div>

      <div className="flex gap-4">
        {pagesLoading ? (
          <LoadingSpinner />
        ) : (
          <PageTreeSidebar
            basePath={basePath}
            pages={pages ?? []}
            activePageId={pageId}
            onCreatePage={(parentId) => void handleCreatePage(parentId)}
            onDeletePage={(id) => void handleDeletePage(id)}
            deleting={deletePage.isPending}
          />
        )}
        <div className="min-w-0 flex-1">
          {pageId ? (
            <Outlet context={{ space }} />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-jira-textSub">
              {(pages ?? []).length === 0
                ? t("projects.overview.docs.noPages")
                : t("projects.overview.docs.emptyStateSelectPage")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
