import { useState } from "react";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useGantt, useUpdateTask } from "@/hooks/useTasks";
import { useProjectMembers } from "@/hooks/useProjects";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { GanttChart } from "@/components/gantt/GanttChart";
import { TaskFormModal } from "@/pages/tasks/TaskFormModal";

export function ProjectGanttTab() {
  const { project } = useProjectDetailContext();
  const { data, isLoading, error } = useGantt(project.id);
  const { data: members } = useProjectMembers(project.id);
  const updateTask = useUpdateTask(project.id);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner label="Loading Gantt…" />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

  const editingTask = data.tasks.find((t) => t.id === editingTaskId) ?? null;

  return (
    <div>
      <GanttChart
        tasks={data.tasks}
        dependencies={data.dependencies}
        onTaskClick={(taskId) => setEditingTaskId(taskId)}
        onDateChange={(taskId, startDate, durationDays) => {
          updateTask.mutate({ taskId, payload: { start_date: startDate, duration_days: durationDays } });
        }}
      />
      <ErrorMessage error={updateTask.error} />

      {editingTask && (
        <TaskFormModal
          projectId={project.id}
          initial={editingTask}
          allTasks={data.tasks}
          members={(members ?? []).map((m) => m.user)}
          onClose={() => setEditingTaskId(null)}
        />
      )}
    </div>
  );
}
