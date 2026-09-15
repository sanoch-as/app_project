import { apiClient } from "@/api/client";
import type {
  PercentCompleteHistoryResponse,
  ProgressResponse,
  ProjectedProgressResponse,
  RecalculateResponse,
} from "@/types/api";

export const progressApi = {
  get: (projectId: string) =>
    apiClient.get<ProgressResponse>(`/projects/${projectId}/progress`).then((r) => r.data),

  recalculate: (projectId: string) =>
    apiClient
      .post<RecalculateResponse>(`/projects/${projectId}/progress/recalculate`)
      .then((r) => r.data),

  getProjected: (projectId: string, statusDate: string) =>
    apiClient
      .get<ProjectedProgressResponse>(`/projects/${projectId}/progress/projected`, {
        params: { status_date: statusDate },
      })
      .then((r) => r.data),

  getHistory: (projectId: string, startDate: string, endDate: string, intervalDays: number) =>
    apiClient
      .get<PercentCompleteHistoryResponse>(`/projects/${projectId}/progress/history`, {
        params: { start_date: startDate, end_date: endDate, interval_days: intervalDays },
      })
      .then((r) => r.data),
};
