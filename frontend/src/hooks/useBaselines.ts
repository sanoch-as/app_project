import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { baselinesApi } from "@/api/baselines";
import type { BaselineCreate } from "@/types/api";

export function useBaselines(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "baselines"],
    queryFn: () => baselinesApi.listForProject(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useBaseline(baselineId: string | undefined) {
  return useQuery({
    queryKey: ["baselines", baselineId],
    queryFn: () => baselinesApi.get(baselineId!),
    enabled: Boolean(baselineId),
  });
}

export function useCreateBaseline(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BaselineCreate) => baselinesApi.create(projectId, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "baselines"] }),
  });
}
