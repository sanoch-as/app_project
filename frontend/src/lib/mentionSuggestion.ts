import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { mentionsApi } from "@/api/mentions";
import { MentionList, type MentionListRef } from "@/components/docs/MentionList";
import type { AppMentionAttrs } from "@/lib/mentionExtension";
import type { MentionSearchResult } from "@/types/api";

interface BuildMentionSuggestionOptions {
  spaceId?: string;
  excludePageId?: string;
}

/** Config for `@tiptap/extension-mention`'s `suggestion` option. Search is
 * backed by `GET /mentions/search` (project/task/page, visibility-filtered
 * server-side); the popup is a real React component mounted via Tiptap's
 * `ReactRenderer` and positioned by `SuggestionProps.mount` (Floating UI,
 * built into `@tiptap/suggestion` — no extra positioning code or a tippy.js
 * dependency needed). */
export function buildMentionSuggestion(
  opts: BuildMentionSuggestionOptions,
): Omit<SuggestionOptions<MentionSearchResult, AppMentionAttrs>, "editor"> {
  return {
    char: "@",
    minQueryLength: 1,
    debounce: 200,
    items: async ({ query, signal }) => {
      try {
        return await mentionsApi.search(
          { q: query, space_id: opts.spaceId, exclude_page_id: opts.excludePageId },
          signal,
        );
      } catch {
        return [];
      }
    },
    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "mention",
            attrs: { id: props.id, entityType: props.entityType, label: props.label },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
    render: () => {
      let component: ReactRenderer<MentionListRef> | null = null;
      let unmount: (() => void) | null = null;

      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, { editor: props.editor, props });
          unmount = props.mount(component.element);
        },
        onUpdate: (props) => {
          component?.updateProps(props);
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            unmount?.();
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          unmount?.();
          component?.destroy();
        },
      };
    },
  };
}
