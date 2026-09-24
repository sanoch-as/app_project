import { apiClient } from "@/api/client";
import type {
  Page,
  PageCreate,
  PageMove,
  PageRead,
  PageReferenceSummary,
  PageSummary,
  PageUpdate,
  ReferencedEntityType,
} from "@/types/api";

export const pagesApi = {
  listForSpace: (spaceId: string) =>
    apiClient.get<PageSummary[]>(`/spaces/${spaceId}/pages`).then((r) => r.data),

  create: (spaceId: string, payload: PageCreate) =>
    apiClient.post<PageRead>(`/spaces/${spaceId}/pages`, payload).then((r) => r.data),

  get: (pageId: string) => apiClient.get<PageRead>(`/pages/${pageId}`).then((r) => r.data),

  update: (pageId: string, payload: PageUpdate) =>
    apiClient.patch<PageRead>(`/pages/${pageId}`, payload).then((r) => r.data),

  move: (pageId: string, payload: PageMove) =>
    apiClient.post<PageRead>(`/pages/${pageId}/move`, payload).then((r) => r.data),

  remove: (pageId: string) => apiClient.delete<void>(`/pages/${pageId}`).then((r) => r.data),

  listReferences: (params: {
    referenced_type: ReferencedEntityType;
    referenced_id: string;
    limit?: number;
    offset?: number;
  }) => apiClient.get<Page<PageReferenceSummary>>("/pages/references", { params }).then((r) => r.data),
};
