import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/api/tasks";
import type { DependencyCreate, TaskCreate, TaskMove, TaskStatus, TaskUpdate } from "@/types/api";

export function useProjectTasks(
  projectId: string | undefined,
  params?: { status?: TaskStatus; limit?: number; offset?: number },
) {
  return useQuery({
    queryKey: ["projects", projectId, "tasks", params],
    queryFn: () => tasksApi.listForProject(projectId!, params),
    enabled: Boolean(projectId),
  });
}

export function useGantt(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "gantt"],
    queryFn: () => tasksApi.gantt(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useTask(taskId: string | undefined) {
  return useQuery({
    queryKey: ["tasks", taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: Boolean(taskId),
  });
}

function invalidateProjectTaskViews(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "tasks"] });
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "gantt"] });
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["projects", projectId, "progress"] });
}

export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TaskCreate) => tasksApi.create(projectId, payload),
    onSuccess: () => invalidateProjectTaskViews(queryClient, projectId),
  });
}

export function useUpdateTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: string; payload: TaskUpdate }) =>
      tasksApi.update(taskId, payload),
    onSuccess: () => invalidateProjectTaskViews(queryClient, projectId),
  });
}

export function useMoveTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: string; payload: TaskMove }) =>
      tasksApi.move(taskId, payload),
    onSuccess: () => invalidateProjectTaskViews(queryClient, projectId),
  });
}

export function useDeleteTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => tasksApi.remove(taskId),
    onSuccess: () => invalidateProjectTaskViews(queryClient, projectId),
  });
}

export function useAddDependency(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: string; payload: DependencyCreate }) =>
      tasksApi.addDependency(taskId, payload),
    onSuccess: () => invalidateProjectTaskViews(queryClient, projectId),
  });
}

export function useRemoveDependency(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dependencyId: string) => tasksApi.removeDependency(dependencyId),
    onSuccess: () => invalidateProjectTaskViews(queryClient, projectId),
  });
}
