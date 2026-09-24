import { apiClient } from "@/api/client";
import type { MentionSearchResult, ReferencedEntityType } from "@/types/api";

export const mentionsApi = {
  search: (
    params: {
      q: string;
      types?: ReferencedEntityType[];
      space_id?: string;
      exclude_page_id?: string;
    },
    signal?: AbortSignal,
  ) =>
    apiClient
      .get<MentionSearchResult[]>("/mentions/search", {
        params: { ...params, types: params.types?.join(",") },
        signal,
      })
      .then((r) => r.data),
};
