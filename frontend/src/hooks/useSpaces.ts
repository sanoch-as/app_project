import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { spacesApi } from "@/api/spaces";
import type { SpaceCreate, SpaceUpdate } from "@/types/api";

export function useSpaces(params?: { project_id?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["spaces", params],
    queryFn: () => spacesApi.list(params),
  });
}

export function useSpace(spaceId: string | undefined) {
  return useQuery({
    queryKey: ["spaces", spaceId],
    queryFn: () => spacesApi.get(spaceId!),
    enabled: Boolean(spaceId),
  });
}

export function useCreateSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SpaceCreate) => spacesApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spaces"] }),
  });
}

export function useUpdateSpace(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SpaceUpdate) => spacesApi.update(spaceId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spaces"] }),
  });
}

export function useDeleteSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (spaceId: string) => spacesApi.remove(spaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spaces"] }),
  });
}
