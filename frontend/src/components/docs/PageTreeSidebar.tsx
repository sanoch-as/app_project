import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { IconButton } from "@/components/common/IconButton";
import { buildPageRows, pageHasChildren } from "@/lib/pageTree";
import type { PageSummary } from "@/types/api";

interface PageTreeSidebarProps {
  /** The space's own route prefix, e.g. `/docs/{spaceId}` when reached from
   * the global nav, or `/projects/{projectId}/docs/{spaceId}` from a
   * project's tab — page links must stay under whichever one is current,
   * not always jump to the global one. */
  basePath: string;
  pages: PageSummary[];
  activePageId?: string;
  onCreatePage: (parentPageId: string | null) => void;
  onDeletePage: (pageId: string) => void;
  deleting?: boolean;
}

export function PageTreeSidebar({
  basePath,
  pages,
  activePageId,
  onCreatePage,
  onDeletePage,
  deleting,
}: PageTreeSidebarProps) {
  const { t } = useTranslation();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState<PageSummary | null>(null);
  const rows = useMemo(() => buildPageRows(pages, collapsedIds), [pages, collapsedIds]);

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="w-60 shrink-0 border-r border-jira-borderSoft pr-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-jira-textSub">
          {t("projects.overview.docs.pagesSection")}
        </span>
        <IconButton
          icon={Plus}
          size="sm"
          aria-label={t("projects.overview.docs.newPage")}
          onClick={() => onCreatePage(null)}
        />
      </div>
      <ul className="space-y-0.5">
        {rows.length === 0 && (
          <li className="px-1 py-2 text-xs text-jira-textSub">
            {t("projects.overview.docs.noPages")}
          </li>
        )}
        {rows.map(({ page, depth }) => {
          const expandable = pageHasChildren(pages, page.id);
          const isActive = page.id === activePageId;
          return (
            <li key={page.id}>
              <div
                className={`group flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-jira-hover ${
                  isActive ? "bg-jira-blueBadgeBg text-brand-700" : "text-jira-text"
                }`}
                style={{ paddingLeft: 4 + depth * 14 }}
              >
                {expandable ? (
                  <button
                    type="button"
                    onClick={() => toggleCollapse(page.id)}
                    className="shrink-0 text-jira-textSub"
                    aria-label={
                      collapsedIds.has(page.id)
                        ? t("projects.overview.docs.expand")
                        : t("projects.overview.docs.collapse")
                    }
                  >
                    {collapsedIds.has(page.id) ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                <Link to={`${basePath}/pages/${page.id}`} className="min-w-0 flex-1 truncate">
                  {page.title || t("projects.overview.docs.untitledPage")}
                </Link>
                <button
                  type="button"
                  className="hidden shrink-0 text-jira-textSub hover:text-jira-text group-hover:block"
                  aria-label={t("projects.overview.docs.newSubpage")}
                  onClick={() => onCreatePage(page.id)}
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="hidden shrink-0 text-jira-textSub hover:text-jira-red group-hover:block"
                  aria-label={t("projects.overview.docs.deletePage")}
                  onClick={() => setConfirmingDelete(page)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {confirmingDelete && (
        <ConfirmDialog
          title={t("projects.overview.docs.deletePage")}
          message={t("projects.overview.docs.deletePageConfirm", { title: confirmingDelete.title })}
          busy={deleting}
          onCancel={() => setConfirmingDelete(null)}
          onConfirm={() => {
            onDeletePage(confirmingDelete.id);
            setConfirmingDelete(null);
          }}
        />
      )}
    </div>
  );
}
