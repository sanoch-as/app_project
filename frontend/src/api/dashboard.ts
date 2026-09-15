import { apiClient } from "@/api/client";
import type { DashboardSummary, ProjectDashboard } from "@/types/api";

export const dashboardApi = {
  summary: () => apiClient.get<DashboardSummary>("/dashboard/summary").then((r) => r.data),

  forProject: (projectId: string) =>
    apiClient.get<ProjectDashboard>(`/projects/${projectId}/dashboard`).then((r) => r.data),
};
