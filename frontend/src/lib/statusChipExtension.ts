import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { StatusChipView } from "@/components/docs/StatusChipView";

export interface StatusChipOption {
  id: string;
  label: string;
  color: string;
}

export const DEFAULT_STATUS_CHIP_OPTIONS: StatusChipOption[] = [
  { id: "not_started", label: "No iniciada", color: "#dcdfe4" },
  { id: "in_progress", label: "En curso", color: "#fff0b3" },
  { id: "done", label: "Completada", color: "#dcfff1" },
];

/** An inline, atomic "status" dropdown chip — usable anywhere text can go,
 * including inside a table cell (it's just an inline node, no special
 * table-awareness needed). Each chip carries its own option list rather
 * than referencing a document-wide shared schema (that's how Google Docs'
 * "smart chips" work, but a per-chip option list is a much smaller,
 * self-contained v1 that still covers the actual ask: a colored status
 * pill with an editable set of choices). */
export const StatusChip = Node.create({
  name: "statusChip",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      value: { default: null as string | null },
      options: {
        default: DEFAULT_STATUS_CHIP_OPTIONS,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-options");
          if (!raw) return DEFAULT_STATUS_CHIP_OPTIONS;
          try {
            return JSON.parse(raw) as StatusChipOption[];
          } catch {
            return DEFAULT_STATUS_CHIP_OPTIONS;
          }
        },
        renderHTML: (attributes: { options: StatusChipOption[] }) => ({
          "data-options": JSON.stringify(attributes.options ?? DEFAULT_STATUS_CHIP_OPTIONS),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="status-chip"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const options = (node.attrs.options ?? DEFAULT_STATUS_CHIP_OPTIONS) as StatusChipOption[];
    const current = options.find((option) => option.id === node.attrs.value);
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "status-chip",
        "data-value": node.attrs.value ?? "",
      }),
      current?.label ?? "—",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(StatusChipView);
  },
});
