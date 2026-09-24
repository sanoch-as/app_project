import Mention from "@tiptap/extension-mention";
import type { MentionNodeAttrs, MentionOptions } from "@tiptap/extension-mention";
import type { MentionSearchResult, ReferencedEntityType } from "@/types/api";

export interface AppMentionAttrs extends MentionNodeAttrs {
  entityType: ReferencedEntityType | null;
}

/** Extends Tiptap's official Mention node with an `entityType` attribute
 * (project/task/page) — this app's own addition, since Tiptap's node only
 * ships `id`/`label` by default. Rendered as a `data-mention` span carrying
 * `data-id`/`data-entity-type` so a plain click-delegation handler on the
 * editor's container (see PageEditor.tsx) can navigate on click without
 * needing a full React node view. */
export const AppMention = Mention.extend<MentionOptions<MentionSearchResult, AppMentionAttrs>>({
  addAttributes() {
    return {
      ...this.parent?.(),
      entityType: {
        default: null as ReferencedEntityType | null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-entity-type"),
        renderHTML: (attributes: { entityType: ReferencedEntityType | null }) => ({
          "data-entity-type": attributes.entityType,
        }),
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const label = (node.attrs.label as string | null) ?? (node.attrs.id as string);
    return [
      "span",
      {
        ...HTMLAttributes,
        "data-mention": "",
        "data-id": node.attrs.id,
        "data-entity-type": node.attrs.entityType,
        class: `doc-mention doc-mention-${String(node.attrs.entityType)}`,
      },
      `@${label}`,
    ];
  },
});
