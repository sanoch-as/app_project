import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "@/api/projects";
import type { ProjectCreate, ProjectMemberCreate, ProjectUpdate } from "@/types/api";

export function useProjects(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["projects", params],
    queryFn: () => projectsApi.list(params),
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectCreate) => projectsApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectUpdate) => projectsApi.update(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => projectsApi.remove(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useProjectMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => projectsApi.listMembers(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useAddProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectMemberCreate) => projectsApi.addMember(projectId, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members"] }),
  });
}

export function useRemoveProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => projectsApi.removeMember(projectId, userId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members"] }),
  });
}
