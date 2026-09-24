import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDateFormat } from "@/hooks/useDateFormat";
import { usePage, useUpdatePage } from "@/hooks/usePages";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { PageEditor } from "@/components/docs/PageEditor";
import { DocReferences } from "@/components/docs/DocReferences";
import type { PageContent, SpaceRead } from "@/types/api";

interface SpaceWorkspaceContext {
  space: SpaceRead;
}

const EMPTY_DOC: PageContent = { type: "doc", content: [] };

export function PageDetailPane() {
  const { t } = useTranslation();
  const formatDate = useDateFormat();
  const { pageId } = useParams<{ pageId: string }>();
  const { space } = useOutletContext<SpaceWorkspaceContext>();
  const { data: page, isLoading, error } = usePage(pageId);
  const updatePage = useUpdatePage(space.id);

  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [content, setContent] = useState<PageContent>(EMPTY_DOC);
  const [dirty, setDirty] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  // Which page's data `title`/`content` currently reflect. The editor below
  // is only rendered once this matches `page.id` — closes a real race: if
  // the target page's data is already cache-warm (e.g. navigating back to a
  // page visited earlier this session), `page` can flip to the new page
  // within the very same render in which `content` still holds the
  // *previous* page's (possibly edited, unsaved) draft, since this effect
  // hasn't run yet. Tiptap only reads its `content` prop once, at editor
  // creation — rendering it that one render too early would permanently
  // seed the new page's editor with the old page's content, and later
  // saving it would overwrite the new page with the old one's draft. Gating
  // the render on this flag means the editor is never created before the
  // state genuinely matches the page it's for.
  const [loadedPageId, setLoadedPageId] = useState<string | null>(null);

  useEffect(() => {
    if (page && page.id !== loadedPageId) {
      setTitle(page.title);
      setContent(page.content);
      setDirty(false);
      setEditingTitle(false);
      setLoadedPageId(page.id);
    }
    // Only resetting when `page.id` actually differs from what's loaded —
    // a background refetch of the *same* page (e.g. after saving) must not
    // clobber in-progress edits, which is why this isn't just `[page?.id]`.
  }, [page, loadedPageId]);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        void handleSaveContent();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, content, pageId]);

  function commitTitle() {
    setEditingTitle(false);
    const trimmed = title.trim();
    if (!page || !trimmed || trimmed === page.title) {
      setTitle(page?.title ?? "");
      return;
    }
    updatePage.mutate({ pageId: page.id, payload: { title: trimmed } });
  }

  async function handleSaveContent() {
    if (!page || !dirty) return;
    setSavingContent(true);
    try {
      await updatePage.mutateAsync({ pageId: page.id, payload: { content } });
      setDirty(false);
    } finally {
      setSavingContent(false);
    }
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!page || page.id !== loadedPageId) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {editingTitle ? (
          <input
            autoFocus
            className="input flex-1 text-xl font-semibold"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitle(page.title);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="truncate rounded px-1 text-left text-xl font-semibold text-jira-text hover:bg-jira-hover"
            onClick={() => setEditingTitle(true)}
          >
            {page.title || t("projects.overview.docs.untitledPage")}
          </button>
        )}
        <span className="shrink-0 text-xs text-jira-textSub">
          {t("projects.overview.docs.updatedAt", { date: formatDate(page.updated_at) })}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-jira-borderSoft bg-jira-panel px-3 py-1.5">
        <span className="text-xs text-jira-textSub">
          {dirty
            ? t("projects.overview.docs.unsavedChanges")
            : t("projects.overview.docs.allSaved")}
        </span>
        <button
          type="button"
          className="btn-primary"
          disabled={!dirty || savingContent}
          onClick={() => void handleSaveContent()}
        >
          {savingContent ? t("common.saving") : t("common.saveChanges")}
        </button>
      </div>

      <PageEditor
        key={page.id}
        content={content}
        editable
        spaceId={space.id}
        excludePageId={page.id}
        onChange={(next) => {
          setContent(next);
          setDirty(true);
        }}
      />

      <DocReferences referencedType="page" referencedId={page.id} />
    </div>
  );
}
