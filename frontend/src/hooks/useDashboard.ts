import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/api/dashboard";

export function usePortfolioSummary() {
  return useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => dashboardApi.summary(),
  });
}

export function useProjectDashboard(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "dashboard"],
    queryFn: () => dashboardApi.forProject(projectId!),
    enabled: Boolean(projectId),
  });
}
