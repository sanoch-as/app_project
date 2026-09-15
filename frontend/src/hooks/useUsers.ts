import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import type { UserInvite, UserUpdate } from "@/types/api";

export function useUsers(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => usersApi.list(params),
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UserInvite) => usersApi.invite(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UserUpdate }) =>
      usersApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
