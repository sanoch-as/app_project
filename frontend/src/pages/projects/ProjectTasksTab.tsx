import { useMemo, useState } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Diamond,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Clock as ClockIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjectDetailContext } from "@/pages/projects/ProjectDetailContext";
import { useDeleteTask, useGantt, useProjectTasks, useUpdateTask } from "@/hooks/useTasks";
import { useProjectMembers } from "@/hooks/useProjects";
import { useCreateWorklog } from "@/hooks/useWorklogs";
import { useColumnLayout } from "@/hooks/useColumnLayout";
import { downloadProjectExport } from "@/api/reportsExport";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Modal } from "@/components/common/Modal";
import { StatusDropdownBadge } from "@/components/common/StatusDropdownBadge";
import { PriorityDropdownBadge } from "@/components/common/PriorityDropdownBadge";
import { EditableDateCell } from "@/components/common/EditableDateCell";
import { EditableTextCell } from "@/components/common/EditableTextCell";
import { EditablePercentCell } from "@/components/common/EditablePercentCell";
import { AssigneePickerCell } from "@/components/common/AssigneePickerCell";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/common/Button";
import { IconButton } from "@/components/common/IconButton";
import { Dropdown, DropdownItem } from "@/components/common/Dropdown";
import { JIRA_PROJECT_ROOT_KEY } from "@/lib/jiraImport";
import { WorklogForm } from "@/components/timesheet/WorklogForm";
import { TaskFormModal } from "@/pages/tasks/TaskFormModal";
import { ImportFromJiraModal } from "@/pages/projects/ImportFromJiraModal";
import { TaskTreeTable } from "@/pages/projects/TaskTreeTable";
import { DependencyManager } from "@/pages/tasks/DependencyManager";
import type { ExportType, TaskRead, TaskStatus } from "@/types/api";

const STATUS_OPTIONS: (TaskStatus | "")[] = ["", "not_started", "in_progress", "blocked", "completed"];

const FLAT_TABLE_DEFAULT_LAYOUT = {
  order: [
    "wbs_code",
    "name",
    "status",
    "priority",
    "start_date",
    "end_date",
    "percent_complete",
    "critical",
    "assignees",
    "actions",
  ],
  widths: {
    wbs_code: 90,
    name: 260,
    status: 140,
    priority: 110,
    start_date: 120,
    end_date: 120,
    percent_complete: 90,
    critical: 130,
    assignees: 180,
    actions: 140,
  },
};

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
  const [showImport, setShowImport] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRead | null>(null);
  const [managingDeps, setManagingDeps] = useState<TaskRead | null>(null);
  const [loggingHours, setLoggingHours] = useState<TaskRead | null>(null);
  const [deleting, setDeleting] = useState<TaskRead | null>(null);
  const [exporting, setExporting] = useState<ExportType | null>(null);
  const [exportError, setExportError] = useState<unknown>(null);

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

  const columnLayout = useColumnLayout("pmp:columns:tasks-flat", FLAT_TABLE_DEFAULT_LAYOUT);

  const columns = useMemo<ColumnDef<TaskRead>[]>(
    () => [
      {
        accessorKey: "wbs_code",
        header: t("tasks.table.key"),
        size: columnLayout.widths.wbs_code,
        cell: ({ row }) => (
          <span className="rounded bg-jira-blueBadgeBg px-1.5 py-0.5 font-mono text-xs font-semibold text-jira-blueBadgeText">
            {row.original.wbs_code}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: t("common.name"),
        size: columnLayout.widths.name,
        cell: ({ row }) => (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {row.original.is_milestone && (
              <Diamond
                className="h-3 w-3 shrink-0 fill-jira-orange text-jira-orange"
                aria-label={t("tasks.table.milestone")}
              />
            )}
            <EditableTextCell
              value={row.original.name}
              onChange={(name) => updateTask.mutate({ taskId: row.original.id, payload: { name } })}
            />
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("common.status"),
        size: columnLayout.widths.status,
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
        size: columnLayout.widths.priority,
        cell: ({ row }) => (
          <PriorityDropdownBadge
            priority={row.original.priority}
            onChange={(priority) =>
              updateTask.mutate({ taskId: row.original.id, payload: { priority } })
            }
          />
        ),
      },
      {
        accessorKey: "start_date",
        header: t("tasks.table.startDate"),
        size: columnLayout.widths.start_date,
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
        size: columnLayout.widths.end_date,
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
        size: columnLayout.widths.percent_complete,
        cell: ({ row }) => (
          <EditablePercentCell
            value={row.original.percent_complete}
            disabled={parentIds.has(row.original.id)}
            disabledTitle={t("tasks.table.rollupTooltip")}
            onChange={(percent_complete) =>
              updateTask.mutate({ taskId: row.original.id, payload: { percent_complete } })
            }
          />
        ),
      },
      {
        id: "critical",
        header: t("tasks.table.critical"),
        size: columnLayout.widths.critical,
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
        size: columnLayout.widths.assignees,
        cell: ({ row }) => (
          <AssigneePickerCell
            assignees={row.original.assignees}
            members={memberUsers}
            onChange={(assignees) =>
              updateTask.mutate({ taskId: row.original.id, payload: { assignees } })
            }
            disabled={updateTask.isPending && updateTask.variables?.taskId === row.original.id}
          />
        ),
      },
      {
        id: "actions",
        header: "",
        size: columnLayout.widths.actions,
        enableResizing: false,
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
              title={
                row.original.external_key === JIRA_PROJECT_ROOT_KEY
                  ? t("tasks.table.projectRootNotDeletable")
                  : undefined
              }
              disabled={row.original.external_key === JIRA_PROJECT_ROOT_KEY}
              className="hover:bg-jira-red/10 hover:text-jira-red"
              onClick={() => setDeleting(row.original)}
            />
          </div>
        ),
      },
    ],
    [updateTask, t, parentIds, memberUsers, columnLayout.widths],
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: {
      sorting,
      globalFilter: nameFilter,
      columnOrder: columnLayout.order,
      columnSizing: columnLayout.widths,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setNameFilter,
    onColumnOrderChange: (updater) => {
      columnLayout.setOrder(typeof updater === "function" ? updater(columnLayout.order) : updater);
    },
    onColumnSizingChange: (updater) => {
      columnLayout.setWidths(
        typeof updater === "function" ? updater(columnLayout.widths) : updater,
      );
    },
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) =>
      row.original.name.toLowerCase().includes(filterValue.toLowerCase()) ||
      row.original.wbs_code.toLowerCase().includes(filterValue.toLowerCase()),
  });

  const statusFilterLabel =
    statusFilter === "" ? t("tasks.table.allStatuses") : t(`enums.taskStatus.${statusFilter}`);

  async function handleDownload(type: ExportType, extension: string) {
    setExporting(type);
    setExportError(null);
    try {
      const safeName = project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      await downloadProjectExport(project.id, type, `${safeName}-tareas.${extension}`);
    } catch (err) {
      setExportError(err);
    } finally {
      setExporting(null);
    }
  }

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
        <div className="flex gap-2">
          {!showTree && (
            <IconButton
              icon={RotateCcw}
              aria-label={t("tasks.table.resetColumns")}
              title={t("tasks.table.resetColumns")}
              onClick={columnLayout.reset}
            />
          )}
          <Dropdown
            trigger={({ toggle }) => (
              <Button
                variant="secondary"
                iconLeft={Download}
                onClick={toggle}
                loading={exporting !== null}
              >
                {exporting !== null ? t("reports.downloading") : t("tasks.table.download")}
              </Button>
            )}
          >
            {({ close }) => (
              <>
                <DropdownItem
                  onClick={() => {
                    close();
                    void handleDownload("tasks_xlsx", "xlsx");
                  }}
                >
                  <FileSpreadsheet
                    className="mr-2 inline h-4 w-4 text-jira-greenBadgeText"
                    aria-hidden="true"
                  />
                  {t("tasks.table.downloadExcel")}
                </DropdownItem>
                <DropdownItem
                  onClick={() => {
                    close();
                    void handleDownload("tasks_pdf", "pdf");
                  }}
                >
                  <FileText className="mr-2 inline h-4 w-4 text-jira-red" aria-hidden="true" />
                  {t("tasks.table.downloadPdf")}
                </DropdownItem>
              </>
            )}
          </Dropdown>
          <Button variant="secondary" iconLeft={Upload} onClick={() => setShowImport(true)}>
            {t("jiraImport.trigger")}
          </Button>
          <Button variant="primary" iconLeft={Plus} onClick={() => setShowCreate(true)}>
            {t("tasks.table.newTask")}
          </Button>
        </div>
      </div>

      {isLoading && <LoadingSpinner />}
      <ErrorMessage error={error} />
      <ErrorMessage error={exportError} />

      {showTree ? (
        gantt ? (
          <TaskTreeTable
            projectId={project.id}
            tasks={gantt.tasks}
            members={memberUsers}
            onEdit={setEditingTask}
            onManageDeps={setManagingDeps}
            onLogHours={setLoggingHours}
            onDelete={setDeleting}
          />
        ) : (
          <LoadingSpinner />
        )
      ) : (
        data && (
          <DataTable
            table={table}
            emptyMessage={t("tasks.table.noTasksMatch")}
            enableColumnCustomization
            pinnedColumnIds={["actions"]}
          />
        )
      )}

      {showCreate && (
        <TaskFormModal
          projectId={project.id}
          allTasks={allTasks}
          members={memberUsers}
          onClose={() => setShowCreate(false)}
        />
      )}
      {showImport && (
        <ImportFromJiraModal projectId={project.id} onClose={() => setShowImport(false)} />
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
