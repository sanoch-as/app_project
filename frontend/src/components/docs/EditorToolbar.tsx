import type { Editor } from "@tiptap/react";
import {
  Baseline,
  Bold,
  Code2,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  PaintBucket,
  Rows3,
  Table as TableIcon,
  Tag,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "@/components/common/Dropdown";
import { IconButton } from "@/components/common/IconButton";
import { ColorSwatchPicker } from "@/components/docs/ColorSwatchPicker";
import { HIGHLIGHT_SWATCHES } from "@/lib/colorSwatches";
import { EmojiPickerButton } from "@/components/docs/EmojiPickerButton";
import { emptyChecklistBlockContent } from "@/lib/checklistBlockExtension";

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const { t } = useTranslation();
  if (!editor) return null;

  function promptForLink() {
    const previousUrl = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt(t("projects.overview.docs.toolbar.linkPrompt"), previousUrl ?? "");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function promptForImage() {
    const url = window.prompt(t("projects.overview.docs.toolbar.imagePrompt"));
    if (!url) return;
    editor!.chain().focus().setImage({ src: url }).run();
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 border-b border-jira-borderSoft pb-2">
      <IconButton
        icon={Bold}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.bold")}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <IconButton
        icon={Italic}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.italic")}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <span className="mx-1 h-4 w-px bg-jira-border" />
      <IconButton
        icon={Heading1}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.heading1")}
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <IconButton
        icon={Heading2}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.heading2")}
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <IconButton
        icon={Heading3}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.heading3")}
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <span className="mx-1 h-4 w-px bg-jira-border" />
      <IconButton
        icon={List}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.bulletList")}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <IconButton
        icon={ListOrdered}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.orderedList")}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <IconButton
        icon={Code2}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.codeBlock")}
        title={t("projects.overview.docs.toolbar.codeBlock")}
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <span className="mx-1 h-4 w-px bg-jira-border" />
      <IconButton
        icon={TableIcon}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.table")}
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      />
      <IconButton
        icon={LinkIcon}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.link")}
        active={editor.isActive("link")}
        onClick={promptForLink}
      />
      <IconButton
        icon={ImageIcon}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.image")}
        onClick={promptForImage}
      />
      <span className="mx-1 h-4 w-px bg-jira-border" />
      <Dropdown
        trigger={({ toggle }) => (
          <IconButton
            icon={Baseline}
            size="sm"
            aria-label={t("projects.overview.docs.toolbar.textColor")}
            title={t("projects.overview.docs.toolbar.textColor")}
            onClick={toggle}
          />
        )}
      >
        {({ close }) => (
          <ColorSwatchPicker
            value={editor.getAttributes("textStyle").color as string | undefined}
            onSelect={(color) => {
              editor.chain().focus().setColor(color).run();
              close();
            }}
            onClear={() => {
              editor.chain().focus().unsetColor().run();
              close();
            }}
          />
        )}
      </Dropdown>
      <Dropdown
        trigger={({ toggle }) => (
          <IconButton
            icon={Highlighter}
            size="sm"
            aria-label={t("projects.overview.docs.toolbar.highlight")}
            title={t("projects.overview.docs.toolbar.highlight")}
            active={editor.isActive("highlight")}
            onClick={toggle}
          />
        )}
      >
        {({ close }) => (
          <ColorSwatchPicker
            swatches={HIGHLIGHT_SWATCHES}
            value={editor.getAttributes("highlight").color as string | undefined}
            onSelect={(color) => {
              editor.chain().focus().toggleHighlight({ color }).run();
              close();
            }}
            onClear={() => {
              editor.chain().focus().unsetHighlight().run();
              close();
            }}
          />
        )}
      </Dropdown>
      <span className="mx-1 h-4 w-px bg-jira-border" />
      <IconButton
        icon={Tag}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.statusChip")}
        title={t("projects.overview.docs.toolbar.statusChip")}
        onClick={() => editor.chain().focus().insertContent({ type: "statusChip" }).run()}
      />
      <IconButton
        icon={ListTodo}
        size="sm"
        aria-label={t("projects.overview.docs.toolbar.checklist")}
        title={t("projects.overview.docs.toolbar.checklist")}
        onClick={() => editor.chain().focus().insertContent(emptyChecklistBlockContent()).run()}
      />
      <EmojiPickerButton editor={editor} />
      <span className="ml-2 text-xs text-jira-textSub">
        {t("projects.overview.docs.toolbar.mentionHint")}
      </span>

      {editor.isActive("table") && (
        <div className="flex w-full flex-wrap items-center gap-1 border-t border-jira-borderSoft pt-2">
          <span className="mr-1 text-xs font-medium text-jira-textSub">
            {t("projects.overview.docs.toolbar.tableGroup")}
          </span>
          <IconButton
            icon={Columns3}
            size="sm"
            aria-label={t("projects.overview.docs.toolbar.addColumn")}
            title={t("projects.overview.docs.toolbar.addColumn")}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          />
          <IconButton
            icon={Trash2}
            size="sm"
            aria-label={t("projects.overview.docs.toolbar.deleteColumn")}
            title={t("projects.overview.docs.toolbar.deleteColumn")}
            onClick={() => editor.chain().focus().deleteColumn().run()}
          />
          <span className="mx-1 h-4 w-px bg-jira-border" />
          <IconButton
            icon={Rows3}
            size="sm"
            aria-label={t("projects.overview.docs.toolbar.addRow")}
            title={t("projects.overview.docs.toolbar.addRow")}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          />
          <IconButton
            icon={Trash2}
            size="sm"
            aria-label={t("projects.overview.docs.toolbar.deleteRow")}
            title={t("projects.overview.docs.toolbar.deleteRow")}
            onClick={() => editor.chain().focus().deleteRow().run()}
          />
          <span className="mx-1 h-4 w-px bg-jira-border" />
          <IconButton
            icon={TableIcon}
            size="sm"
            aria-label={t("projects.overview.docs.toolbar.deleteTable")}
            title={t("projects.overview.docs.toolbar.deleteTable")}
            className="hover:bg-red-50 hover:text-jira-red"
            onClick={() => editor.chain().focus().deleteTable().run()}
          />
          <span className="mx-1 h-4 w-px bg-jira-border" />
          <Dropdown
            trigger={({ toggle }) => (
              <IconButton
                icon={PaintBucket}
                size="sm"
                aria-label={t("projects.overview.docs.toolbar.cellFill")}
                title={t("projects.overview.docs.toolbar.cellFill")}
                onClick={toggle}
              />
            )}
          >
            {({ close }) => (
              <ColorSwatchPicker
                value={editor.getAttributes("tableCell").backgroundColor as string | undefined}
                onSelect={(color) => {
                  editor.chain().focus().setCellAttribute("backgroundColor", color).run();
                  close();
                }}
                onClear={() => {
                  editor.chain().focus().setCellAttribute("backgroundColor", null).run();
                  close();
                }}
              />
            )}
          </Dropdown>
        </div>
      )}
    </div>
  );
}
