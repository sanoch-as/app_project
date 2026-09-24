import type { PageSummary } from "@/types/api";

export interface IndentedPageRow {
  page: PageSummary;
  depth: number;
}

function childrenByParentOf(pages: PageSummary[]): Map<string | null, PageSummary[]> {
  const map = new Map<string | null, PageSummary[]>();
  for (const page of pages) {
    const siblings = map.get(page.parent_page_id) ?? [];
    siblings.push(page);
    map.set(page.parent_page_id, siblings);
  }
  for (const siblings of map.values()) siblings.sort((a, b) => a.sort_order - b.sort_order);
  return map;
}

/** Flat, depth-annotated list for the sidebar tree — same "flatten instead
 * of literal nesting" shape as TaskTreeTable.tsx's `buildRows`, adapted to
 * `PageSummary`/`parent_page_id` (a fresh, small implementation rather than
 * a shared import, since the two trees serve different UIs). */
export function buildPageRows(pages: PageSummary[], collapsedIds: Set<string>): IndentedPageRow[] {
  const childrenByParent = childrenByParentOf(pages);
  const rows: IndentedPageRow[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const page of childrenByParent.get(parentId) ?? []) {
      rows.push({ page, depth });
      if (!collapsedIds.has(page.id)) visit(page.id, depth + 1);
    }
  }
  visit(null, 0);
  return rows;
}

export function pageHasChildren(pages: PageSummary[], pageId: string): boolean {
  return pages.some((p) => p.parent_page_id === pageId);
}
