import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useDeleteTask, useGantt, useProjectTasks } from "@/hooks/useTasks";
import { useProjectMembers } from "@/hooks/useProjects";
import { useCreateWorklog } from "@/hooks/useWorklogs";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Modal } from "@/components/common/Modal";
import { PriorityBadge, TaskStatusBadge } from "@/components/common/Badge";
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

  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRead | null>(null);
  const [managingDeps, setManagingDeps] = useState<TaskRead | null>(null);
  const [loggingHours, setLoggingHours] = useState<TaskRead | null>(null);
  const [deleting, setDeleting] = useState<TaskRead | null>(null);

  const memberUsers = useMemo(() => (members ?? []).map((m) => m.user), [members]);
  const allTasks = gantt?.tasks ?? data?.items ?? [];

  const columns = useMemo<ColumnDef<TaskRead>[]>(
    () => [
      { accessorKey: "wbs_code", header: "WBS" },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span>
            {row.original.name}
            {row.original.is_milestone && <span className="ml-1" title="Milestone">🔶</span>}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <TaskStatusBadge status={row.original.status} />,
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
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              critical · {row.original.total_float ?? 0}d float
            </span>
          ) : (
            <span className="text-xs text-slate-400">
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
          <div className="flex justify-end gap-2 whitespace-nowrap text-xs">
            <button className="font-medium text-brand-600 hover:underline" onClick={() => setEditingTask(row.original)}>
              Edit
            </button>
            <button className="font-medium text-slate-600 hover:underline" onClick={() => setManagingDeps(row.original)}>
              Dependencies
            </button>
            <button className="font-medium text-slate-600 hover:underline" onClick={() => setLoggingHours(row.original)}>
              Log hours
            </button>
            <button className="font-medium text-red-600 hover:underline" onClick={() => setDeleting(row.original)}>
              Delete
            </button>
          </div>
        ),
      },
    ],
    [],
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
          <select
            className="input w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "")}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "All statuses" : s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
          + New task
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />

      {data && (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="cursor-pointer whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ?? ""}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">
                    No tasks match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
