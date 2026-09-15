import { apiClient } from "@/api/client";
import type { Page, UserInvite, UserRead, UserUpdate } from "@/types/api";

export const usersApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    apiClient
      .get<Page<UserRead>>("/users", { params })
      .then((r) => r.data),

  get: (id: string) => apiClient.get<UserRead>(`/users/${id}`).then((r) => r.data),

  update: (id: string, payload: UserUpdate) =>
    apiClient.patch<UserRead>(`/users/${id}`, payload).then((r) => r.data),

  invite: (payload: UserInvite) =>
    apiClient.post<UserRead>("/users/invite", payload).then((r) => r.data),
};
