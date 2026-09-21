import { useMemo, useState } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Diamond, Filter, Link2, Pencil, Plus, Trash2, Clock as ClockIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useDeleteTask, useGantt, useProjectTasks, useUpdateTask } from "@/hooks/useTasks";
import { useProjectMembers } from "@/hooks/useProjects";
import { useCreateWorklog } from "@/hooks/useWorklogs";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Modal } from "@/components/common/Modal";
import { PriorityBadge } from "@/components/common/Badge";
import { StatusDropdownBadge } from "@/components/common/StatusDropdownBadge";
import { EditableDateCell } from "@/components/common/EditableDateCell";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/common/Button";
import { IconButton } from "@/components/common/IconButton";
import { Dropdown, DropdownItem } from "@/components/common/Dropdown";
import { WorklogForm } from "@/components/timesheet/WorklogForm";
import { TaskFormModal } from "@/pages/tasks/TaskFormModal";
import { TaskTreeTable } from "@/pages/projects/TaskTreeTable";
import { DependencyManager } from "@/pages/tasks/DependencyManager";
import type { TaskRead, TaskStatus } from "@/types/api";

const STATUS_OPTIONS: (TaskStatus | "")[] = ["", "not_started", "in_progress", "blocked", "completed"];

export function ProjectTasksTab() {
  const { t } = useTranslation();
  const { project } = useProjectDetailContext();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [nameFilter, setNameFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "wbs_code", desc: false }]);

  const { data, isLoading, error } = useProjectTasks(project.id, {
    status: statusFilter || undefined,
    limit: 100,
  });
  const { data: gantt } = useGantt(project.id);
  const { data: members } = useProjectMembers(project.id);
  const deleteTask = useDeleteTask(project.id);
  const updateTask = useUpdateTask(project.id);

  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRead | null>(null);
  const [managingDeps, setManagingDeps] = useState<TaskRead | null>(null);
  const [loggingHours, setLoggingHours] = useState<TaskRead | null>(null);
  const [deleting, setDeleting] = useState<TaskRead | null>(null);

  const memberUsers = useMemo(() => (members ?? []).map((m) => m.user), [members]);
  const allTasks = gantt?.tasks ?? data?.items ?? [];
  const parentIds = useMemo(
    () =>
      new Set(
        (gantt?.tasks ?? []).map((t) => t.parent_task_id).filter((id): id is string => id !== null),
      ),
    [gantt],
  );
  // Tree view (WBS hierarchy + drag-and-drop) is only meaningful over the
  // whole unfiltered task list — a name/status filter can't decide how to
  // show a matching task's non-matching ancestors, so it falls back to the
  // flat, sortable table instead.
  const showTree = statusFilter === "" && nameFilter.trim() === "";

  const columns = useMemo<ColumnDef<TaskRead>[]>(
    () => [
      {
        accessorKey: "wbs_code",
        header: t("tasks.table.key"),
        cell: ({ row }) => (
          <span className="rounded bg-jira-blueBadgeBg px-1.5 py-0.5 font-mono text-xs font-semibold text-jira-blueBadgeText">
            {row.original.wbs_code}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: t("common.name"),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            {row.original.is_milestone && (
              <Diamond
                className="h-3 w-3 shrink-0 fill-jira-orange text-jira-orange"
                aria-label={t("tasks.table.milestone")}
              />
            )}
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("common.status"),
        cell: ({ row }) => (
          <StatusDropdownBadge
            status={row.original.status}
            onChange={(status) => updateTask.mutate({ taskId: row.original.id, payload: { status } })}
          />
        ),
      },
      {
        accessorKey: "priority",
        header: t("tasks.table.priority"),
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: "start_date",
        header: t("tasks.table.startDate"),
        cell: ({ row }) => (
          <EditableDateCell
            value={row.original.start_date}
            disabled={parentIds.has(row.original.id)}
            disabledTitle={t("tasks.table.rollupTooltip")}
            onChange={(value) =>
              updateTask.mutate({ taskId: row.original.id, payload: { start_date: value } })
            }
          />
        ),
      },
      {
        accessorKey: "end_date",
        header: t("tasks.table.endDate"),
        cell: ({ row }) => (
          <EditableDateCell
            value={row.original.end_date}
            disabled={parentIds.has(row.original.id)}
            disabledTitle={t("tasks.table.rollupTooltip")}
            onChange={(value) =>
              updateTask.mutate({ taskId: row.original.id, payload: { end_date: value } })
            }
          />
        ),
      },
      {
        accessorKey: "percent_complete",
        header: t("tasks.table.percentDone"),
        cell: ({ row }) => `${row.original.percent_complete}%`,
      },
      {
        id: "critical",
        header: t("tasks.table.critical"),
        cell: ({ row }) =>
          row.original.is_critical ? (
            <span className="badge-pill normal-case bg-jira-red/10 text-jira-red">
              {t("tasks.table.criticalFloat", { days: row.original.total_float ?? 0 })}
            </span>
          ) : (
            <span className="text-xs text-jira-textSub">
              {row.original.total_float !== null
                ? t("tasks.table.float", { days: row.original.total_float })
                : "—"}
            </span>
          ),
      },
      {
        id: "assignees",
        header: t("tasks.table.assignees"),
        cell: ({ row }) =>
          row.original.assignees.length > 0
            ? row.original.assignees.map((a) => a.user.full_name).join(", ")
            : "—",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <IconButton
              icon={Pencil}
              size="sm"
              aria-label={t("tasks.table.editTask")}
              onClick={() => setEditingTask(row.original)}
            />
            <IconButton
              icon={Link2}
              size="sm"
              aria-label={t("tasks.table.manageDependencies")}
              onClick={() => setManagingDeps(row.original)}
            />
            <IconButton
              icon={ClockIcon}
              size="sm"
              aria-label={t("tasks.table.logHours")}
              onClick={() => setLoggingHours(row.original)}
            />
            <IconButton
              icon={Trash2}
              size="sm"
              aria-label={t("tasks.table.deleteTask")}
              className="hover:bg-jira-red/10 hover:text-jira-red"
              onClick={() => setDeleting(row.original)}
            />
          </div>
        ),
      },
    ],
    [updateTask, t, parentIds],
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: { sorting, globalFilter: nameFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setNameFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) =>
      row.original.name.toLowerCase().includes(filterValue.toLowerCase()) ||
      row.original.wbs_code.toLowerCase().includes(filterValue.toLowerCase()),
  });

  const statusFilterLabel =
    statusFilter === "" ? t("tasks.table.allStatuses") : t(`enums.taskStatus.${statusFilter}`);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-56"
            placeholder={t("tasks.table.searchPlaceholder")}
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
          <Dropdown
            trigger={({ toggle }) => (
              <Button variant="secondary" size="sm" iconLeft={Filter} onClick={toggle}>
                <span>{statusFilterLabel}</span>
              </Button>
            )}
          >
            {({ close }) => (
              <>
                {STATUS_OPTIONS.map((s) => (
                  <DropdownItem
                    key={s}
                    onClick={() => {
                      setStatusFilter(s);
                      close();
                    }}
                  >
                    {s === "" ? t("tasks.table.allStatuses") : t(`enums.taskStatus.${s}`)}
                  </DropdownItem>
                ))}
              </>
            )}
          </Dropdown>
        </div>
        <Button variant="primary" iconLeft={Plus} onClick={() => setShowCreate(true)}>
          {t("tasks.table.newTask")}
        </Button>
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {showTree ? (
        gantt ? (
          <TaskTreeTable
            projectId={project.id}
            tasks={gantt.tasks}
            onEdit={setEditingTask}
            onManageDeps={setManagingDeps}
            onLogHours={setLoggingHours}
            onDelete={setDeleting}
          />
        ) : (
          <LoadingSpinner />
        )
      ) : (
        data && <DataTable table={table} emptyMessage={t("tasks.table.noTasksMatch")} />
      )}

      {showCreate && (
        <TaskFormModal
          projectId={project.id}
          allTasks={allTasks}
          members={memberUsers}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editingTask && (
        <TaskFormModal
          projectId={project.id}
          initial={editingTask}
          allTasks={allTasks}
          members={memberUsers}
          onClose={() => setEditingTask(null)}
          onNavigate={(taskId) => setEditingTask(allTasks.find((t) => t.id === taskId) ?? null)}
        />
      )}
      {managingDeps && gantt && (
        <DependencyManager
          projectId={project.id}
          task={managingDeps}
          allTasks={gantt.tasks}
          dependencies={gantt.dependencies}
          onClose={() => setManagingDeps(null)}
        />
      )}
      {loggingHours && (
        <LogHoursModal task={loggingHours} projectId={project.id} onClose={() => setLoggingHours(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          title={t("tasks.table.deleteTaskTitle")}
          message={t("tasks.table.deleteTaskMessage", { name: deleting.name, wbs: deleting.wbs_code })}
          confirmLabel={t("common.delete")}
          busy={deleteTask.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            deleteTask.mutate(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function LogHoursModal({
  task,
  projectId,
  onClose,
}: {
  task: TaskRead;
  projectId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createWorklog = useCreateWorklog(task.id, projectId);
  return (
    <Modal title={t("tasks.table.logHoursTitle", { name: task.name })} onClose={onClose}>
      <WorklogForm
        isPending={createWorklog.isPending}
        error={createWorklog.error}
        onCancel={onClose}
        onSubmit={(payload) => createWorklog.mutate(payload, { onSuccess: onClose })}
      />
    </Modal>
  );
}
