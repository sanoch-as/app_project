import { TableCell, TableHeader } from "@tiptap/extension-table";

/** `TableCell`/`TableHeader` ship with no background-color attribute —
 * extended here to add one, applied via `editor.commands.setCellAttribute
 * ("backgroundColor", hex)`. Registered in place of `TableKit`'s built-in
 * versions (`tableCell: false, tableHeader: false` in its config) so there's
 * exactly one definition of each node, not two competing ones. */
export const AppTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
        renderHTML: (attributes: { backgroundColor: string | null }) =>
          attributes.backgroundColor ? { style: `background-color: ${attributes.backgroundColor}` } : {},
      },
    };
  },
});

export const AppTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
        renderHTML: (attributes: { backgroundColor: string | null }) =>
          attributes.backgroundColor ? { style: `background-color: ${attributes.backgroundColor}` } : {},
      },
    };
  },
});
