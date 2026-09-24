import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pagesApi } from "@/api/pages";
import type { PageCreate, PageMove, PageUpdate, ReferencedEntityType } from "@/types/api";

export function usePagesTree(spaceId: string | undefined) {
  return useQuery({
    queryKey: ["spaces", spaceId, "pages"],
    queryFn: () => pagesApi.listForSpace(spaceId!),
    enabled: Boolean(spaceId),
  });
}

export function usePage(pageId: string | undefined) {
  return useQuery({
    queryKey: ["pages", pageId],
    queryFn: () => pagesApi.get(pageId!),
    enabled: Boolean(pageId),
  });
}

export function usePageReferences(params: {
  referenced_type: ReferencedEntityType;
  referenced_id: string | undefined;
}) {
  return useQuery({
    queryKey: ["pages", "references", params.referenced_type, params.referenced_id],
    queryFn: () =>
      pagesApi.listReferences({
        referenced_type: params.referenced_type,
        referenced_id: params.referenced_id!,
      }),
    enabled: Boolean(params.referenced_id),
  });
}

function invalidateSpacePageViews(
  queryClient: ReturnType<typeof useQueryClient>,
  spaceId: string,
) {
  queryClient.invalidateQueries({ queryKey: ["spaces", spaceId, "pages"] });
}

export function useCreatePage(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PageCreate) => pagesApi.create(spaceId, payload),
    onSuccess: () => invalidateSpacePageViews(queryClient, spaceId),
  });
}

export function useUpdatePage(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, payload }: { pageId: string; payload: PageUpdate }) =>
      pagesApi.update(pageId, payload),
    onSuccess: (updated) => {
      invalidateSpacePageViews(queryClient, spaceId);
      queryClient.invalidateQueries({ queryKey: ["pages", updated.id] });
      queryClient.invalidateQueries({ queryKey: ["pages", "references"] });
    },
  });
}

export function useMovePage(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, payload }: { pageId: string; payload: PageMove }) =>
      pagesApi.move(pageId, payload),
    onSuccess: () => invalidateSpacePageViews(queryClient, spaceId),
  });
}

export function useDeletePage(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) => pagesApi.remove(pageId),
    onSuccess: () => invalidateSpacePageViews(queryClient, spaceId),
  });
}
