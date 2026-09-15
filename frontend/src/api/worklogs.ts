import { apiClient } from "@/api/client";
import type { Page, WorklogCreate, WorklogRead, WorklogUpdate } from "@/types/api";

export const worklogsApi = {
  listForTask: (taskId: string, params?: { limit?: number; offset?: number }) =>
    apiClient
      .get<Page<WorklogRead>>(`/tasks/${taskId}/worklogs`, { params })
      .then((r) => r.data),

  create: (taskId: string, payload: WorklogCreate) =>
    apiClient
      .post<WorklogRead>(`/tasks/${taskId}/worklogs`, payload)
      .then((r) => r.data),

  update: (worklogId: string, payload: WorklogUpdate) =>
    apiClient.patch<WorklogRead>(`/worklogs/${worklogId}`, payload).then((r) => r.data),

  remove: (worklogId: string) =>
    apiClient.delete<void>(`/worklogs/${worklogId}`).then((r) => r.data),
};

export interface WorklogReportParams {
  project_id?: string;
  user_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export const reportsApi = {
  worklogs: (params: WorklogReportParams) =>
    apiClient
      .get<Page<WorklogRead>>("/reports/worklogs", { params })
      .then((r) => r.data),
};
