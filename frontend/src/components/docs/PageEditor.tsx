import type { MouseEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { useNavigate } from "react-router-dom";
import { tasksApi } from "@/api/tasks";
import { EditorToolbar } from "@/components/docs/EditorToolbar";
import "@/components/docs/doc-editor.css";
import { AppMention } from "@/lib/mentionExtension";
import { buildMentionSuggestion } from "@/lib/mentionSuggestion";
import { AppTableCell, AppTableHeader } from "@/lib/tableCellExtensions";
import { StatusChip } from "@/lib/statusChipExtension";
import { ChecklistBlock } from "@/lib/checklistBlockExtension";
import { AppCodeBlock } from "@/lib/codeBlockExtension";
import type { PageContent, ReferencedEntityType } from "@/types/api";

interface PageEditorProps {
  content: PageContent;
  editable: boolean;
  onChange?: (content: PageContent) => void;
  spaceId: string;
  excludePageId?: string;
}

/** Renders (and, when `editable`, edits) a page's Tiptap document. Content
 * is JSON we control end to end (our own custom node types, no arbitrary
 * user HTML) — see ADR-042 for why that means no HTML sanitizer is needed
 * here. Mention navigation is handled by a single click-delegation handler
 * on the container instead of a per-mention React node view — simpler, and
 * works because ProseMirror renders real DOM inside this React tree. */
export function PageEditor({ content, editable, onChange, spaceId, excludePageId }: PageEditorProps) {
  const navigate = useNavigate();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true }, codeBlock: false }),
      AppCodeBlock,
      TableKit.configure({
        table: { resizable: true, lastColumnResizable: true },
        tableCell: false,
        tableHeader: false,
      }),
      AppTableCell,
      AppTableHeader,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      AppMention.configure({ suggestion: buildMentionSuggestion({ spaceId, excludePageId }) }),
      StatusChip,
      ChecklistBlock,
    ],
    content: content as JSONContent,
    editable,
    onUpdate: ({ editor: current }) => onChange?.(current.getJSON() as PageContent),
  });

  async function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-mention]");
    if (!target) return;
    const id = target.getAttribute("data-id");
    const entityType = target.getAttribute("data-entity-type") as ReferencedEntityType | null;
    if (!id || !entityType) return;

    if (entityType === "project") {
      navigate(`/projects/${id}`);
    } else if (entityType === "page") {
      navigate(`/docs/pages/${id}`);
    } else if (entityType === "task") {
      try {
        const task = await tasksApi.get(id);
        navigate(`/projects/${task.project_id}/tasks`);
      } catch {
        // The mentioned task may have been deleted since — nothing to navigate to.
      }
    }
  }

  return (
    <div>
      {editable && <EditorToolbar editor={editor} />}
      <div onClick={editable ? undefined : handleClick} className="doc-editor-content">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
