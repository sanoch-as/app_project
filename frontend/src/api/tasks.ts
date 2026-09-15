import { apiClient } from "@/api/client";
import type {
  DependencyCreate,
  DependencyRead,
  GanttResponse,
  Page,
  TaskCreate,
  TaskMove,
  TaskRead,
  TaskStatus,
  TaskUpdate,
} from "@/types/api";

export const tasksApi = {
  listForProject: (
    projectId: string,
    params?: { status?: TaskStatus; limit?: number; offset?: number },
  ) =>
    apiClient
      .get<Page<TaskRead>>(`/projects/${projectId}/tasks`, { params })
      .then((r) => r.data),

  create: (projectId: string, payload: TaskCreate) =>
    apiClient
      .post<TaskRead>(`/projects/${projectId}/tasks`, payload)
      .then((r) => r.data),

  get: (taskId: string) => apiClient.get<TaskRead>(`/tasks/${taskId}`).then((r) => r.data),

  update: (taskId: string, payload: TaskUpdate) =>
    apiClient.patch<TaskRead>(`/tasks/${taskId}`, payload).then((r) => r.data),

  remove: (taskId: string) => apiClient.delete<void>(`/tasks/${taskId}`).then((r) => r.data),

  move: (taskId: string, payload: TaskMove) =>
    apiClient.post<TaskRead>(`/tasks/${taskId}/move`, payload).then((r) => r.data),

  gantt: (projectId: string) =>
    apiClient.get<GanttResponse>(`/projects/${projectId}/gantt`).then((r) => r.data),

  addDependency: (taskId: string, payload: DependencyCreate) =>
    apiClient
      .post<DependencyRead>(`/tasks/${taskId}/dependencies`, payload)
      .then((r) => r.data),

  removeDependency: (dependencyId: string) =>
    apiClient.delete<void>(`/dependencies/${dependencyId}`).then((r) => r.data),
};
