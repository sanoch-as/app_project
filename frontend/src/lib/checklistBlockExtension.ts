import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ChecklistBlockView } from "@/components/docs/ChecklistBlockView";

/** A titled checklist with a live progress bar, wrapping a single `taskList`
 * as its content — the title is a plain string attribute (not itself rich
 * text), so the node's content model stays simple (`content: "taskList"`)
 * instead of mixing inline title text with a block list in one schema. */
export const ChecklistBlock = Node.create({
  name: "checklistBlock",
  group: "block",
  content: "taskList",
  isolating: true,

  addAttributes() {
    return {
      title: { default: "" as string },
      // Pixel width, so the block doesn't have to span the full page width
      // — resized by dragging a handle on its right edge (see
      // ChecklistBlockView), same idea as the table's own column resizing.
      width: {
        default: null as number | null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.style.width;
          return raw ? Number.parseInt(raw, 10) : null;
        },
        renderHTML: (attributes: { width: number | null }) =>
          attributes.width ? { style: `width: ${attributes.width}px` } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="checklist-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "checklist-block" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChecklistBlockView);
  },
});

export function emptyChecklistBlockContent(): Record<string, unknown> {
  return {
    type: "checklistBlock",
    attrs: { title: "" },
    content: [
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}
