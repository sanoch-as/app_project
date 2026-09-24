import { apiClient } from "@/api/client";
import type { Page, SpaceCreate, SpaceRead, SpaceUpdate } from "@/types/api";

export const spacesApi = {
  list: (params?: { project_id?: string; limit?: number; offset?: number }) =>
    apiClient.get<Page<SpaceRead>>("/spaces", { params }).then((r) => r.data),

  create: (payload: SpaceCreate) =>
    apiClient.post<SpaceRead>("/spaces", payload).then((r) => r.data),

  get: (spaceId: string) => apiClient.get<SpaceRead>(`/spaces/${spaceId}`).then((r) => r.data),

  update: (spaceId: string, payload: SpaceUpdate) =>
    apiClient.patch<SpaceRead>(`/spaces/${spaceId}`, payload).then((r) => r.data),

  remove: (spaceId: string) => apiClient.delete<void>(`/spaces/${spaceId}`).then((r) => r.data),
};
