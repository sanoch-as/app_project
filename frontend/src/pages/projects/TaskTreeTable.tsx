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
import clsx from "clsx";
import { Diamond, GripVertical, Link2, Pencil, Trash2, Clock as ClockIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EditableDateCell } from "@/components/common/EditableDateCell";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { IconButton } from "@/components/common/IconButton";
import { PriorityBadge } from "@/components/common/Badge";
import { StatusDropdownBadge } from "@/components/common/StatusDropdownBadge";
import { useMoveTask, useUpdateTask } from "@/hooks/useTasks";
import type { TaskRead, TaskStatus } from "@/types/api";

const GRID_COLS =
  "grid grid-cols-[28px_90px_minmax(220px,1fr)_140px_90px_110px_110px_64px_130px_160px_140px] items-center";

interface TaskTreeTableProps {
  projectId: string;
  tasks: TaskRead[];
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

function buildRows(tasks: TaskRead[]): TreeRowData[] {
  const childrenByParent = childrenByParentOf(tasks);
  const rows: TreeRowData[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const task of childrenByParent.get(parentId) ?? []) {
      rows.push({ task, depth });
      visit(task.id, depth + 1);
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
 * filtered result set can't decide how to show non-matching ancestors. */
export function TaskTreeTable({
  projectId,
  tasks,
  onEdit,
  onManageDeps,
  onLogHours,
  onDelete,
}: TaskTreeTableProps) {
  const { t } = useTranslation();
  const updateTask = useUpdateTask(projectId);
  const moveTask = useMoveTask(projectId);
  const [activeId, setActiveId] = useState<string | null>(null);

  const rows = useMemo(() => buildRows(tasks), [tasks]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const forbiddenTargetIds = useMemo(
    () => (activeId ? collectDescendantIds(activeId, tasks) : new Set<string>()),
    [activeId, tasks],
  );
  const parentIds = useMemo(
    () => new Set(tasks.map((task) => task.parent_task_id).filter((id): id is string => id !== null)),
    [tasks],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
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

  return (
    <div className="card overflow-x-auto">
      <ErrorMessage error={moveTask.error} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="min-w-[1180px]">
          <div className={clsx(GRID_COLS, "border-b border-jira-border bg-jira-panel px-3 py-2 text-xs font-bold uppercase tracking-wide text-jira-textSub")}>
            <span />
            <span>{t("tasks.table.key")}</span>
            <span>{t("common.name")}</span>
            <span>{t("common.status")}</span>
            <span>{t("tasks.table.priority")}</span>
            <span>{t("tasks.table.startDate")}</span>
            <span>{t("tasks.table.endDate")}</span>
            <span>{t("tasks.table.percentDone")}</span>
            <span>{t("tasks.table.critical")}</span>
            <span>{t("tasks.table.assignees")}</span>
            <span />
          </div>
          <div className="divide-y divide-jira-borderSoft">
            {rows.map(({ task, depth }) => (
              <TreeRow
                key={task.id}
                task={task}
                depth={depth}
                isParent={parentIds.has(task.id)}
                dragInProgress={activeId !== null}
                forbidden={forbiddenTargetIds.has(task.id)}
                onStatusChange={(status) => updateTask.mutate({ taskId: task.id, payload: { status } })}
                onStartDateChange={(value) =>
                  updateTask.mutate({ taskId: task.id, payload: { start_date: value } })
                }
                onEndDateChange={(value) =>
                  updateTask.mutate({ taskId: task.id, payload: { end_date: value } })
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
        </div>
      </DndContext>
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
  dragInProgress: boolean;
  forbidden: boolean;
  onStatusChange: (status: TaskStatus) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onEdit: () => void;
  onManageDeps: () => void;
  onLogHours: () => void;
  onDelete: () => void;
}

function TreeRow({
  task,
  depth,
  isParent,
  dragInProgress,
  forbidden,
  onStatusChange,
  onStartDateChange,
  onEndDateChange,
  onEdit,
  onManageDeps,
  onLogHours,
  onDelete,
}: TreeRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <div className={clsx("relative px-3 py-1.5 hover:bg-jira-hover", GRID_COLS, isDragging && "opacity-40")}>
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
      <span className="w-fit rounded bg-jira-blueBadgeBg px-1.5 py-0.5 font-mono text-xs font-semibold text-jira-blueBadgeText">
        {task.wbs_code}
      </span>
      <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
        {task.is_milestone && (
          <Diamond
            className="h-3 w-3 shrink-0 fill-jira-orange text-jira-orange"
            aria-label={t("tasks.table.milestone")}
          />
        )}
        <span className="truncate">{task.name}</span>
      </span>
      <StatusDropdownBadge status={task.status} onChange={onStatusChange} />
      <PriorityBadge priority={task.priority} />
      <EditableDateCell
        value={task.start_date}
        disabled={isParent}
        disabledTitle={t("tasks.table.rollupTooltip")}
        onChange={onStartDateChange}
      />
      <EditableDateCell
        value={task.end_date}
        disabled={isParent}
        disabledTitle={t("tasks.table.rollupTooltip")}
        onChange={onEndDateChange}
      />
      <span>{task.percent_complete}%</span>
      {task.is_critical ? (
        <span className="badge-pill w-fit normal-case bg-jira-red/10 text-jira-red">
          {t("tasks.table.criticalFloat", { days: task.total_float ?? 0 })}
        </span>
      ) : (
        <span className="text-xs text-jira-textSub">
          {task.total_float !== null ? t("tasks.table.float", { days: task.total_float }) : "—"}
        </span>
      )}
      <span className="truncate text-xs text-jira-textSub">
        {task.assignees.length > 0 ? task.assignees.map((a) => a.user.full_name).join(", ") : "—"}
      </span>
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
          className="hover:bg-jira-red/10 hover:text-jira-red"
          onClick={onDelete}
        />
      </div>
    </div>
  );
}
