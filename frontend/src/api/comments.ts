import { apiClient } from "@/api/client";
import type { Page, TaskCommentCreate, TaskCommentRead } from "@/types/api";

export const commentsApi = {
  listForTask: (taskId: string, params?: { limit?: number; offset?: number }) =>
    apiClient
      .get<Page<TaskCommentRead>>(`/tasks/${taskId}/comments`, { params })
      .then((r) => r.data),

  create: (taskId: string, payload: TaskCommentCreate) =>
    apiClient
      .post<TaskCommentRead>(`/tasks/${taskId}/comments`, payload)
      .then((r) => r.data),

  remove: (commentId: string) =>
    apiClient.delete<void>(`/comments/${commentId}`).then((r) => r.data),
};
