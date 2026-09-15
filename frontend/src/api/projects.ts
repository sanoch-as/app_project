import { apiClient } from "@/api/client";
import type {
  Page,
  ProjectCreate,
  ProjectMemberCreate,
  ProjectMemberRead,
  ProjectRead,
  ProjectUpdate,
} from "@/types/api";

export const projectsApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<Page<ProjectRead>>("/projects", { params }).then((r) => r.data),

  get: (id: string) => apiClient.get<ProjectRead>(`/projects/${id}`).then((r) => r.data),

  create: (payload: ProjectCreate) =>
    apiClient.post<ProjectRead>("/projects", payload).then((r) => r.data),

  update: (id: string, payload: ProjectUpdate) =>
    apiClient.patch<ProjectRead>(`/projects/${id}`, payload).then((r) => r.data),

  remove: (id: string) => apiClient.delete<void>(`/projects/${id}`).then((r) => r.data),

  listMembers: (id: string) =>
    apiClient.get<ProjectMemberRead[]>(`/projects/${id}/members`).then((r) => r.data),

  addMember: (id: string, payload: ProjectMemberCreate) =>
    apiClient
      .post<ProjectMemberRead>(`/projects/${id}/members`, payload)
      .then((r) => r.data),

  removeMember: (id: string, userId: string) =>
    apiClient.delete<void>(`/projects/${id}/members/${userId}`).then((r) => r.data),
};
