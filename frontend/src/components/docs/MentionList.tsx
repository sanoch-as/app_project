import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { FileText, FolderKanban, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MentionSearchResult, ReferencedEntityType } from "@/types/api";

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface MentionListProps {
  items: MentionSearchResult[];
  loading?: boolean;
  command: (item: { id: string; entityType: ReferencedEntityType; label: string }) => void;
}

const TYPE_ICON: Record<ReferencedEntityType, typeof FolderKanban> = {
  project: FolderKanban,
  task: ListChecks,
  page: FileText,
};

export const MentionList = forwardRef<MentionListRef, MentionListProps>(function MentionList(
  { items, loading, command },
  ref,
) {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

  function selectItem(index: number) {
    const item = items[index];
    if (item) command({ id: item.id, entityType: item.type, label: item.label });
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false;
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="max-h-64 w-72 overflow-y-auto rounded-md border border-jira-border bg-white py-1 shadow-jira-md">
      {loading ? (
        <div className="px-3 py-2 text-xs text-jira-textSub">{t("common.loading")}</div>
      ) : items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-jira-textSub">
          {t("projects.overview.docs.mentionNoResults")}
        </div>
      ) : (
        items.map((item, index) => {
          const Icon = TYPE_ICON[item.type];
          return (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                index === selectedIndex ? "bg-jira-hover" : ""
              }`}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => selectItem(index)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-jira-textSub" aria-hidden="true" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.sublabel && (
                <span className="shrink-0 text-xs text-jira-textSub">{item.sublabel}</span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
});
