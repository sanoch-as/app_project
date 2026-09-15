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
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/common/Button";
import { IconButton } from "@/components/common/IconButton";
import { Dropdown, DropdownItem } from "@/components/common/Dropdown";
import { WorklogForm } from "@/components/timesheet/WorklogForm";
import { TaskFormModal } from "@/pages/tasks/TaskFormModal";
import { DependencyManager } from "@/pages/tasks/DependencyManager";
import type { TaskRead, TaskStatus } from "@/types/api";

const STATUS_OPTIONS: (TaskStatus | "")[] = ["", "not_started", "in_progress", "blocked", "completed"];

export function ProjectTasksTab() {
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

  const columns = useMemo<ColumnDef<TaskRead>[]>(
    () => [
      {
        accessorKey: "wbs_code",
        header: "Key",
        cell: ({ row }) => (
          <span className="rounded bg-jira-blueBadgeBg px-1.5 py-0.5 font-mono text-xs font-semibold text-jira-blueBadgeText">
            {row.original.wbs_code}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            {row.original.is_milestone && (
              <Diamond
                className="h-3 w-3 shrink-0 fill-jira-orange text-jira-orange"
                aria-label="Milestone"
              />
            )}
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusDropdownBadge
            status={row.original.status}
            onChange={(status) => updateTask.mutate({ taskId: row.original.id, payload: { status } })}
          />
        ),
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      { accessorKey: "start_date", header: "Start" },
      { accessorKey: "end_date", header: "End" },
      {
        accessorKey: "percent_complete",
        header: "% Done",
        cell: ({ row }) => `${row.original.percent_complete}%`,
      },
      {
        id: "critical",
        header: "Critical",
        cell: ({ row }) =>
          row.original.is_critical ? (
            <span className="badge-pill normal-case bg-jira-red/10 text-jira-red">
              critical · {row.original.total_float ?? 0}d float
            </span>
          ) : (
            <span className="text-xs text-jira-textSub">
              {row.original.total_float ?? "—"}d float
            </span>
          ),
      },
      {
        id: "assignees",
        header: "Assignees",
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
              aria-label="Edit task"
              onClick={() => setEditingTask(row.original)}
            />
            <IconButton
              icon={Link2}
              size="sm"
              aria-label="Manage dependencies"
              onClick={() => setManagingDeps(row.original)}
            />
            <IconButton
              icon={ClockIcon}
              size="sm"
              aria-label="Log hours"
              onClick={() => setLoggingHours(row.original)}
            />
            <IconButton
              icon={Trash2}
              size="sm"
              aria-label="Delete task"
              className="hover:bg-jira-red/10 hover:text-jira-red"
              onClick={() => setDeleting(row.original)}
            />
          </div>
        ),
      },
    ],
    [updateTask],
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

  const statusFilterLabel = statusFilter === "" ? "All statuses" : statusFilter.replace("_", " ");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-56"
            placeholder="Search by name or WBS…"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
          <Dropdown
            trigger={({ toggle }) => (
              <Button variant="secondary" size="sm" iconLeft={Filter} onClick={toggle}>
                <span className="capitalize">{statusFilterLabel}</span>
              </Button>
            )}
          >
            {({ close }) => (
              <>
                {STATUS_OPTIONS.map((s) => (
                  <DropdownItem
                    key={s}
                    className="capitalize"
                    onClick={() => {
                      setStatusFilter(s);
                      close();
                    }}
                  >
                    {s === "" ? "All statuses" : s.replace("_", " ")}
                  </DropdownItem>
                ))}
              </>
            )}
          </Dropdown>
        </div>
        <Button variant="primary" iconLeft={Plus} onClick={() => setShowCreate(true)}>
          New task
        </Button>
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {data && <DataTable table={table} emptyMessage="No tasks match." />}

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
          title="Delete task"
          message={`Delete "${deleting.name}" (${deleting.wbs_code})? Its dependencies and worklogs are removed too.`}
          confirmLabel="Delete"
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
  const createWorklog = useCreateWorklog(task.id, projectId);
  return (
    <Modal title={`Log hours — ${task.name}`} onClose={onClose}>
      <WorklogForm
        isPending={createWorklog.isPending}
        error={createWorklog.error}
        onCancel={onClose}
        onSubmit={(payload) => createWorklog.mutate(payload, { onSuccess: onClose })}
      />
    </Modal>
  );
}
