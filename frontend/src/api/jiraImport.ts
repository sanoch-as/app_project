import { apiClient } from "@/api/client";
import type { JiraImportResponse } from "@/types/api";

export const jiraImportApi = {
  importIntoProject: (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient
      .post<JiraImportResponse>(`/projects/${projectId}/tasks/import/jira-csv`, formData)
      .then((r) => r.data);
  },

  importAsNewProject: (projectName: string, file: File) => {
    const formData = new FormData();
    formData.append("project_name", projectName);
    formData.append("file", file);
    return apiClient
      .post<JiraImportResponse>("/projects/import/jira-csv", formData)
      .then((r) => r.data);
  },
};
