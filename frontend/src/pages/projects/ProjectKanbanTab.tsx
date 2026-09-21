import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useGantt, useUpdateTask } from "@/hooks/useTasks";
import { useProjectMembers } from "@/hooks/useProjects";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskFormModal } from "@/pages/tasks/TaskFormModal";

export function ProjectKanbanTab() {
  const { t } = useTranslation();
  const { project } = useProjectDetailContext();
  const { data, isLoading, error } = useGantt(project.id);
  const { data: members } = useProjectMembers(project.id);
  const updateTask = useUpdateTask(project.id);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const memberUsers = useMemo(() => (members ?? []).map((m) => m.user), [members]);

  if (isLoading) return <LoadingSpinner label={t("kanban.loadingTasks")} />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

  const editingTask = data.tasks.find((t) => t.id === editingTaskId) ?? null;

  return (
    <div>
      <KanbanBoard
        tasks={data.tasks}
        onStatusChange={(taskId, status) => updateTask.mutate({ taskId, payload: { status } })}
        onTaskClick={(taskId) => setEditingTaskId(taskId)}
      />
      <ErrorMessage error={updateTask.error} />

      {editingTask && (
        <TaskFormModal
          projectId={project.id}
          initial={editingTask}
          allTasks={data.tasks}
          members={memberUsers}
          onClose={() => setEditingTaskId(null)}
          onNavigate={setEditingTaskId}
        />
      )}
    </div>
  );
}
