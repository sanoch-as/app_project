import { apiClient } from "@/api/client";
import type { ProgressResponse, RecalculateResponse } from "@/types/api";

export const progressApi = {
  get: (projectId: string) =>
    apiClient.get<ProgressResponse>(`/projects/${projectId}/progress`).then((r) => r.data),

  recalculate: (projectId: string) =>
    apiClient
      .post<RecalculateResponse>(`/projects/${projectId}/progress/recalculate`)
      .then((r) => r.data),
};
