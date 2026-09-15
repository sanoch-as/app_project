import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reportsApi, worklogsApi, type WorklogReportParams } from "@/api/worklogs";
import type { WorklogCreate, WorklogUpdate } from "@/types/api";

export function useTaskWorklogs(taskId: string | undefined) {
  return useQuery({
    queryKey: ["tasks", taskId, "worklogs"],
    queryFn: () => worklogsApi.listForTask(taskId!),
    enabled: Boolean(taskId),
  });
}

export function useCreateWorklog(taskId: string, projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorklogCreate) => worklogsApi.create(taskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", taskId, "worklogs"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "progress"] });
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["reports", "worklogs"] });
      }
    },
  });
}

export function useUpdateWorklog(taskId: string, projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ worklogId, payload }: { worklogId: string; payload: WorklogUpdate }) =>
      worklogsApi.update(worklogId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", taskId, "worklogs"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "progress"] });
        queryClient.invalidateQueries({ queryKey: ["reports", "worklogs"] });
      }
    },
  });
}

export function useDeleteWorklog(taskId: string, projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (worklogId: string) => worklogsApi.remove(worklogId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", taskId, "worklogs"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "progress"] });
        queryClient.invalidateQueries({ queryKey: ["reports", "worklogs"] });
      }
    },
  });
}

export function useWorklogsReport(params: WorklogReportParams) {
  return useQuery({
    queryKey: ["reports", "worklogs", params],
    queryFn: () => reportsApi.worklogs(params),
  });
}
