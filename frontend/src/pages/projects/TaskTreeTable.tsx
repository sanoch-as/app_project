import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import {
  ChevronDown,
  ChevronRight,
  Diamond,
  GripVertical,
  Link2,
  Pencil,
  RotateCcw,
  Trash2,
  Clock as ClockIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AssigneePickerCell } from "@/components/common/AssigneePickerCell";
import { ColumnResizeHandle } from "@/components/common/ColumnResizeHandle";
import { EditableDateCell } from "@/components/common/EditableDateCell";
import { EditablePercentCell } from "@/components/common/EditablePercentCell";
import { EditableTextCell } from "@/components/common/EditableTextCell";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { IconButton } from "@/components/common/IconButton";
import { PriorityDropdownBadge } from "@/components/common/PriorityDropdownBadge";
import { StatusDropdownBadge } from "@/components/common/StatusDropdownBadge";
import { useColumnLayout } from "@/hooks/useColumnLayout";
import { useMoveTask, useUpdateTask } from "@/hooks/useTasks";
import { JIRA_PROJECT_ROOT_KEY } from "@/lib/jiraImport";
import type { TaskAssigneeInput, TaskPriority, TaskRead, TaskStatus, UserRead } from "@/types/api";

const MIN_COLUMN_WIDTH = 50;

const COLUMN_LABEL_KEYS: Record<string, string> = {
  wbs_code: "tasks.table.key",
  name: "common.name",
  status: "common.status",
  priority: "tasks.table.priority",
  start_date: "tasks.table.startDate",
  end_date: "tasks.table.endDate",
  percent_complete: "tasks.table.percentDone",
  critical: "tasks.table.critical",
  assignees: "tasks.table.assignees",
};

const TREE_DEFAULT_LAYOUT = {
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
  ],
  widths: {
    wbs_code: 90,
    name: 260,
    status: 140,
    priority: 90,
    start_date: 132,
    end_date: 132,
    percent_complete: 64,
    critical: 130,
    assignees: 160,
  },
};

interface TaskTreeTableProps {
  projectId: string;
  tasks: TaskRead[];
  members: UserRead[];
  onEdit: (task: TaskRead) => void;
  onManageDeps: (task: TaskRead) => void;
  onLogHours: (task: TaskRead) => void;
  onDelete: (task: TaskRead) => void;
}

interface TreeRowData {
  task: TaskRead;
  depth: number;
}

function siblingIndex(task: TaskRead): number {
  const segment = task.wbs_code.split(".").pop();
  const parsed = segment ? Number(segment) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function childrenByParentOf(tasks: TaskRead[]): Map<string | null, TaskRead[]> {
  const map = new Map<string | null, TaskRead[]>();
  for (const task of tasks) {
    const siblings = map.get(task.parent_task_id) ?? [];
    siblings.push(task);
    map.set(task.parent_task_id, siblings);
  }
  for (const siblings of map.values()) {
    siblings.sort((a, b) => siblingIndex(a) - siblingIndex(b));
  }
  return map;
}

function buildRows(tasks: TaskRead[], collapsedIds: Set<string>): TreeRowData[] {
  const childrenByParent = childrenByParentOf(tasks);
  const rows: TreeRowData[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const task of childrenByParent.get(parentId) ?? []) {
      rows.push({ task, depth });
      if (!collapsedIds.has(task.id)) {
        visit(task.id, depth + 1);
      }
    }
  }
  visit(null, 0);
  return rows;
}

/** `taskId` plus every one of its descendants — used to forbid dropping a
 * dragged task onto itself or onto its own subtree (a cycle). */
function collectDescendantIds(taskId: string, tasks: TaskRead[]): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.parent_task_id === null) continue;
    const ids = childrenByParent.get(task.parent_task_id) ?? [];
    ids.push(task.id);
    childrenByParent.set(task.parent_task_id, ids);
  }
  const result = new Set<string>([taskId]);
  const stack = [taskId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const childId of childrenByParent.get(current) ?? []) {
      if (!result.has(childId)) {
        result.add(childId);
        stack.push(childId);
      }
    }
  }
  return result;
}

/** Renders the Tasks table as a WBS tree (drag-and-drop reparenting, Jira
 * Cloud style) instead of TanStack Table's flat/sortable grid — used only
 * when no name/status filter is active (see ProjectTasksTab), since a
 * filtered result set can't decide how to show non-matching ancestors.
 * Column order/width are hand-rolled (this grid predates and isn't backed
 * by TanStack Table) but persist the same way as the flat view's, via
 * useColumnLayout under a different storage key. */
export function TaskTreeTable({
  projectId,
  tasks,
  members,
  onEdit,
  onManageDeps,
  onLogHours,
  onDelete,
}: TaskTreeTableProps) {
  const { t } = useTranslation();
  const updateTask = useUpdateTask(projectId);
  const moveTask = useMoveTask(projectId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const columnLayout = useColumnLayout("pmp:columns:tasks-tree", TREE_DEFAULT_LAYOUT);

  function toggleCollapsed(taskId: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  const rows = useMemo(() => buildRows(tasks, collapsedIds), [tasks, collapsedIds]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const forbiddenTargetIds = useMemo(
    () => (activeId ? collectDescendantIds(activeId, tasks) : new Set<string>()),
    [activeId, tasks],
  );
  const parentIds = useMemo(
    () => new Set(tasks.map((task) => task.parent_task_id).filter((id): id is string => id !== null)),
    [tasks],
  );

  const gridTemplateColumns = useMemo(
    () =>
      `28px ${columnLayout.order.map((id) => `${columnLayout.widths[id] ?? TREE_DEFAULT_LAYOUT.widths[id as keyof typeof TREE_DEFAULT_LAYOUT.widths] ?? 120}px`).join(" ")} 140px`,
    [columnLayout.order, columnLayout.widths],
  );

  const rowSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const columnSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleRowDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const draggedId = String(active.id);
    const overId = String(over.id);
    const separator = overId.indexOf(":");
    const zone = overId.slice(0, separator) as "before" | "after" | "inside";
    const targetId = overId.slice(separator + 1);
    if (draggedId === targetId) return;
    if (collectDescendantIds(draggedId, tasks).has(targetId)) return;

    let newParentId: string | null;
    let position: number;

    if (zone === "inside") {
      newParentId = targetId;
      position = tasks.filter((task) => task.parent_task_id === targetId && task.id !== draggedId).length;
    } else {
      const target = tasksById.get(targetId);
      if (!target) return;
      newParentId = target.parent_task_id;
      const siblings = tasks
        .filter((task) => task.parent_task_id === newParentId && task.id !== draggedId)
        .sort((a, b) => siblingIndex(a) - siblingIndex(b));
      const targetIndex = siblings.findIndex((task) => task.id === targetId);
      position = zone === "before" ? targetIndex : targetIndex + 1;
    }

    moveTask.mutate({ taskId: draggedId, payload: { parent_task_id: newParentId, position } });
  }

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = columnLayout.order.indexOf(String(active.id));
    const newIndex = columnLayout.order.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    columnLayout.setOrder(arrayMove(columnLayout.order, oldIndex, newIndex));
  }

  function startColumnResize(columnId: string) {
    return (downEvent: React.MouseEvent | React.TouchEvent) => {
      downEvent.preventDefault();
      const isTouch = "touches" in downEvent;
      const startX = isTouch ? downEvent.touches[0].clientX : downEvent.clientX;
      const startWidth =
        columnLayout.widths[columnId] ??
        TREE_DEFAULT_LAYOUT.widths[columnId as keyof typeof TREE_DEFAULT_LAYOUT.widths] ??
        120;

      function onMove(moveEvent: MouseEvent | TouchEvent) {
        // Duck-typed rather than `instanceof TouchEvent` — that global
        // constructor doesn't exist in every browser, which would throw.
        const clientX = "touches" in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
        columnLayout.setWidth(columnId, Math.max(MIN_COLUMN_WIDTH, startWidth + (clientX - startX)));
      }
      function onEnd() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onEnd);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onEnd);
      document.addEventListener("touchmove", onMove);
      document.addEventListener("touchend", onEnd);
    };
  }

  return (
    <div className="card overflow-x-auto">
      <ErrorMessage error={moveTask.error} />
      <div className="min-w-[1224px]">
        <DndContext sensors={columnSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
          <SortableContext items={columnLayout.order} strategy={horizontalListSortingStrategy}>
            <div
              className="grid items-center border-b border-jira-border bg-jira-panel px-3 py-2 text-xs font-bold uppercase tracking-wide text-jira-textSub"
              style={{ gridTemplateColumns }}
            >
              <span />
              {columnLayout.order.map((columnId) => (
                <TreeHeaderCell
                  key={columnId}
                  columnId={columnId}
                  label={t(COLUMN_LABEL_KEYS[columnId] ?? columnId)}
                  onResizeStart={startColumnResize(columnId)}
                />
              ))}
              <span className="flex justify-end">
                <button
                  type="button"
                  onClick={columnLayout.reset}
                  className="rounded p-0.5 text-jira-textSub hover:bg-jira-hover hover:text-jira-text"
                  aria-label={t("tasks.table.resetColumns")}
                  title={t("tasks.table.resetColumns")}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          </SortableContext>
        </DndContext>

        <DndContext
          sensors={rowSensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragCancel={() => setActiveId(null)}
          onDragEnd={handleRowDragEnd}
        >
          <div className="divide-y divide-jira-borderSoft">
            {rows.map(({ task, depth }) => (
              <TreeRow
                key={task.id}
                task={task}
                depth={depth}
                isParent={parentIds.has(task.id)}
                collapsed={collapsedIds.has(task.id)}
                onToggleCollapse={() => toggleCollapsed(task.id)}
                dragInProgress={activeId !== null}
                forbidden={forbiddenTargetIds.has(task.id)}
                columnOrder={columnLayout.order}
                gridTemplateColumns={gridTemplateColumns}
                members={members}
                assigneesSaving={updateTask.isPending && updateTask.variables?.taskId === task.id}
                onNameChange={(name) => updateTask.mutate({ taskId: task.id, payload: { name } })}
                onStatusChange={(status) => updateTask.mutate({ taskId: task.id, payload: { status } })}
                onPriorityChange={(priority) =>
                  updateTask.mutate({ taskId: task.id, payload: { priority } })
                }
                onStartDateChange={(value) =>
                  updateTask.mutate({ taskId: task.id, payload: { start_date: value } })
                }
                onEndDateChange={(value) =>
                  updateTask.mutate({ taskId: task.id, payload: { end_date: value } })
                }
                onPercentChange={(percent_complete) =>
                  updateTask.mutate({ taskId: task.id, payload: { percent_complete } })
                }
                onAssigneesChange={(assignees) =>
                  updateTask.mutate({ taskId: task.id, payload: { assignees } })
                }
                onEdit={() => onEdit(task)}
                onManageDeps={() => onManageDeps(task)}
                onLogHours={() => onLogHours(task)}
                onDelete={() => onDelete(task)}
              />
            ))}
            {rows.length === 0 && (
              <div className="px-3 py-8 text-center text-jira-textSub">
                {t("tasks.table.noTasksMatch")}
              </div>
            )}
          </div>
        </DndContext>
      </div>
    </div>
  );
}

function TreeHeaderCell({
  columnId,
  label,
  onResizeStart,
}: {
  columnId: string;
  label: string;
  onResizeStart: (e: React.MouseEvent | React.TouchEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnId,
  });
  return (
    // setNodeRef stays on the whole cell (dnd-kit measures this for
    // collision detection), but the drag listeners are scoped to just the
    // label span — the resize handle is its sibling, not its descendant, so
    // a pointerdown there never bubbles into the reorder-drag activator.
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx(
        "relative flex items-center truncate pr-2",
        isDragging && "z-10 rounded bg-jira-hover opacity-70",
      )}
    >
      <span className="cursor-grab truncate active:cursor-grabbing" {...attributes} {...listeners}>
        {label}
      </span>
      <ColumnResizeHandle onMouseDown={onResizeStart} onTouchStart={onResizeStart} />
    </div>
  );
}

function DropZone({
  id,
  active,
  className,
  indicatorClassName,
}: {
  id: string;
  active: boolean;
  className: string;
  indicatorClassName: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !active });
  return (
    <div
      ref={setNodeRef}
      className={clsx(className, active ? "pointer-events-auto" : "pointer-events-none", isOver && indicatorClassName)}
    />
  );
}

interface TreeRowProps {
  task: TaskRead;
  depth: number;
  isParent: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  dragInProgress: boolean;
  forbidden: boolean;
  columnOrder: string[];
  gridTemplateColumns: string;
  members: UserRead[];
  assigneesSaving: boolean;
  onNameChange: (name: string) => void;
  onStatusChange: (status: TaskStatus) => void;
  onPriorityChange: (priority: TaskPriority) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onPercentChange: (value: number) => void;
  onAssigneesChange: (assignees: TaskAssigneeInput[]) => void;
  onEdit: () => void;
  onManageDeps: () => void;
  onLogHours: () => void;
  onDelete: () => void;
}

function TreeRow({
  task,
  depth,
  isParent,
  collapsed,
  onToggleCollapse,
  dragInProgress,
  forbidden,
  columnOrder,
  gridTemplateColumns,
  members,
  assigneesSaving,
  onNameChange,
  onStatusChange,
  onPriorityChange,
  onStartDateChange,
  onEndDateChange,
  onPercentChange,
  onAssigneesChange,
  onEdit,
  onManageDeps,
  onLogHours,
  onDelete,
}: TreeRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  function renderColumnCell(columnId: string) {
    switch (columnId) {
      case "wbs_code":
        return (
          <span className="w-fit rounded bg-jira-blueBadgeBg px-1.5 py-0.5 font-mono text-xs font-semibold text-jira-blueBadgeText">
            {task.wbs_code}
          </span>
        );
      case "name":
        return (
          <span className="flex min-w-0 items-center gap-1" style={{ paddingLeft: depth * 20 }}>
            {isParent ? (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="shrink-0 rounded p-0.5 text-jira-textSub hover:bg-jira-hover hover:text-jira-text"
                aria-label={collapsed ? t("tasks.table.expand") : t("tasks.table.collapse")}
              >
                {collapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {task.is_milestone && (
              <Diamond
                className="h-3 w-3 shrink-0 fill-jira-orange text-jira-orange"
                aria-label={t("tasks.table.milestone")}
              />
            )}
            <EditableTextCell value={task.name} onChange={onNameChange} className="min-w-0 flex-1" />
          </span>
        );
      case "status":
        return <StatusDropdownBadge status={task.status} onChange={onStatusChange} />;
      case "priority":
        return <PriorityDropdownBadge priority={task.priority} onChange={onPriorityChange} />;
      case "start_date":
        return (
          <EditableDateCell
            value={task.start_date}
            disabled={isParent}
            disabledTitle={t("tasks.table.rollupTooltip")}
            onChange={onStartDateChange}
          />
        );
      case "end_date":
        return (
          <EditableDateCell
            value={task.end_date}
            disabled={isParent}
            disabledTitle={t("tasks.table.rollupTooltip")}
            onChange={onEndDateChange}
          />
        );
      case "percent_complete":
        return (
          <EditablePercentCell
            value={task.percent_complete}
            disabled={isParent}
            disabledTitle={t("tasks.table.rollupTooltip")}
            onChange={onPercentChange}
          />
        );
      case "critical":
        return task.is_critical ? (
          <span className="badge-pill w-fit normal-case bg-jira-red/10 text-jira-red">
            {t("tasks.table.criticalFloat", { days: task.total_float ?? 0 })}
          </span>
        ) : (
          <span className="text-xs text-jira-textSub">
            {task.total_float !== null ? t("tasks.table.float", { days: task.total_float }) : "—"}
          </span>
        );
      case "assignees":
        return (
          <AssigneePickerCell
            assignees={task.assignees}
            members={members}
            onChange={onAssigneesChange}
            disabled={assigneesSaving}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div
      className={clsx("relative grid items-center px-3 py-1.5 hover:bg-jira-hover", isDragging && "opacity-40")}
      style={{ gridTemplateColumns }}
    >
      {!forbidden && (
        <>
          <DropZone
            id={`before:${task.id}`}
            active={dragInProgress}
            className="absolute inset-x-0 top-0 h-1/4"
            indicatorClassName="border-t-2 border-brand-600"
          />
          <DropZone
            id={`inside:${task.id}`}
            active={dragInProgress}
            className="absolute inset-x-0 top-1/4 h-1/2"
            indicatorClassName="bg-brand-100/60"
          />
          <DropZone
            id={`after:${task.id}`}
            active={dragInProgress}
            className="absolute inset-x-0 bottom-0 h-1/4"
            indicatorClassName="border-b-2 border-brand-600"
          />
        </>
      )}

      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        type="button"
        className="cursor-grab text-jira-textSub hover:text-jira-text active:cursor-grabbing"
        aria-label={t("tasks.table.dragToReorder")}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {columnOrder.map((columnId) => (
        <div key={columnId} className="min-w-0 overflow-hidden pr-2">
          {renderColumnCell(columnId)}
        </div>
      ))}
      <div className="flex justify-end gap-1">
        <IconButton icon={Pencil} size="sm" aria-label={t("tasks.table.editTask")} onClick={onEdit} />
        <IconButton
          icon={Link2}
          size="sm"
          aria-label={t("tasks.table.manageDependencies")}
          onClick={onManageDeps}
        />
        <IconButton icon={ClockIcon} size="sm" aria-label={t("tasks.table.logHours")} onClick={onLogHours} />
        <IconButton
          icon={Trash2}
          size="sm"
          aria-label={t("tasks.table.deleteTask")}
          title={task.external_key === JIRA_PROJECT_ROOT_KEY ? t("tasks.table.projectRootNotDeletable") : undefined}
          disabled={task.external_key === JIRA_PROJECT_ROOT_KEY}
          className="hover:bg-jira-red/10 hover:text-jira-red"
          onClick={onDelete}
        />
      </div>
    </div>
  );
}
