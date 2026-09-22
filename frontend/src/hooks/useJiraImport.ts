import { useMutation, useQueryClient } from "@tanstack/react-query";
import { jiraImportApi } from "@/api/jiraImport";

export function useImportJiraCsv(projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, projectName }: { file: File; projectName?: string }) =>
      projectId
        ? jiraImportApi.importIntoProject(projectId, file)
        : jiraImportApi.importAsNewProject(projectName ?? "", file),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", result.project_id, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects", result.project_id, "gantt"] });
      queryClient.invalidateQueries({ queryKey: ["projects", result.project_id, "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["projects", result.project_id, "progress"] });
    },
  });
}
