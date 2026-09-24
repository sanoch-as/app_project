import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 220;

export function ChecklistBlockView({ node, updateAttributes, view }: NodeViewProps) {
  const { t } = useTranslation();
  const editable = view.editable;
  const width = (node.attrs.width as number | null) ?? DEFAULT_WIDTH;
  const [liveWidth, setLiveWidth] = useState<number | null>(null);

  let total = 0;
  let checked = 0;
  const taskList = node.content.firstChild;
  taskList?.content.forEach((item) => {
    total += 1;
    if (item.attrs.checked) checked += 1;
  });
  const percent = total === 0 ? 0 : Math.round((checked / total) * 100);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editable) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;

    function resolveWidth(clientX: number) {
      return Math.max(MIN_WIDTH, startWidth + (clientX - startX));
    }
    function onMove(moveEvent: PointerEvent) {
      setLiveWidth(resolveWidth(moveEvent.clientX));
    }
    function onUp(upEvent: PointerEvent) {
      updateAttributes({ width: resolveWidth(upEvent.clientX) });
      setLiveWidth(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <NodeViewWrapper
      className="doc-checklist-block"
      style={{ width: `${liveWidth ?? width}px`, maxWidth: "100%" }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <input
          className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-semibold text-jira-text outline-none disabled:cursor-default"
          value={node.attrs.title as string}
          placeholder={t("projects.overview.docs.checklist.titlePlaceholder")}
          disabled={!editable}
          onChange={(e) => updateAttributes({ title: e.target.value })}
        />
        <span className="shrink-0 text-xs font-medium text-jira-textSub">
          {t("projects.overview.docs.checklist.percentComplete", { percent })}
        </span>
      </div>
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-jira-border">
        <div
          className="h-full rounded-full bg-brand-600 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <NodeViewContent className="doc-checklist-items" />
      {editable && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("projects.overview.docs.checklist.resizeHandle")}
          className="doc-checklist-resize-handle"
          onPointerDown={startResize}
        />
      )}
    </NodeViewWrapper>
  );
}
