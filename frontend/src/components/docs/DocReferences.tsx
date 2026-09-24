import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePageReferences } from "@/hooks/usePages";
import type { ReferencedEntityType } from "@/types/api";

interface DocReferencesProps {
  referencedType: ReferencedEntityType;
  referencedId: string | undefined;
}

/** "Which wiki pages mention this task/project/page" — the part of the
 * mention system that pays off outside the editor itself. Renders nothing
 * when there are no references, so it doesn't add clutter to every task or
 * project that was never mentioned anywhere. */
export function DocReferences({ referencedType, referencedId }: DocReferencesProps) {
  const { t } = useTranslation();
  const { data } = usePageReferences({ referenced_type: referencedType, referenced_id: referencedId });
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <div className="card p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-jira-textSub">
        {t("projects.overview.docs.referencedBy")}
      </h3>
      <ul className="space-y-1.5">
        {items.map((ref) => (
          <li key={ref.page_id}>
            <Link
              to={`/docs/${ref.space_id}/pages/${ref.page_id}`}
              className="flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{ref.page_title}</span>
              <span className="shrink-0 text-xs text-jira-textSub">· {ref.space_name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
