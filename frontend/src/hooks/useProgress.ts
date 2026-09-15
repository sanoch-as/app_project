import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { progressApi } from "@/api/progress";

export function useProgress(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "progress"],
    queryFn: () => progressApi.get(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useProjectedProgress(projectId: string | undefined, statusDate: string) {
  return useQuery({
    queryKey: ["projects", projectId, "progress", "projected", statusDate],
    queryFn: () => progressApi.getProjected(projectId!, statusDate),
    enabled: Boolean(projectId && statusDate),
  });
}

export function useRecalculateProgress(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => progressApi.recalculate(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "progress"] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "dashboard"] });
    },
  });
}
