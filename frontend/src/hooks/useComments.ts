import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commentsApi } from "@/api/comments";
import type { TaskCommentCreate } from "@/types/api";

export function useTaskComments(taskId: string | undefined) {
  return useQuery({
    queryKey: ["tasks", taskId, "comments"],
    queryFn: () => commentsApi.listForTask(taskId!),
    enabled: Boolean(taskId),
  });
}

export function useCreateComment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TaskCommentCreate) => commentsApi.create(taskId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", taskId, "comments"] }),
  });
}

export function useDeleteComment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => commentsApi.remove(commentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", taskId, "comments"] }),
  });
}
