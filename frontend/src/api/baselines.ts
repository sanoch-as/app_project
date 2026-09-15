import { apiClient } from "@/api/client";
import type { BaselineCreate, BaselineRead, Page } from "@/types/api";

export const baselinesApi = {
  listForProject: (projectId: string, params?: { limit?: number; offset?: number }) =>
    apiClient
      .get<Page<BaselineRead>>(`/projects/${projectId}/baselines`, { params })
      .then((r) => r.data),

  create: (projectId: string, payload: BaselineCreate) =>
    apiClient
      .post<BaselineRead>(`/projects/${projectId}/baselines`, payload)
      .then((r) => r.data),

  get: (baselineId: string) =>
    apiClient.get<BaselineRead>(`/baselines/${baselineId}`).then((r) => r.data),
};
