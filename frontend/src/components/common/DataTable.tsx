import { flexRender, type Header, type Table } from "@tanstack/react-table";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ColumnResizeHandle } from "@/components/common/ColumnResizeHandle";

interface DataTableProps<TData> {
  table: Table<TData>;
  emptyMessage?: string;
  className?: string;
  /** Opt-in: drag-to-reorder + drag-to-resize column headers, backed by
   * whatever `columnOrder`/`columnSizing` state the caller wired into
   * `useReactTable`. Off by default so other DataTable consumers (e.g.
   * ProjectForecastTab) render exactly as before. */
  enableColumnCustomization?: boolean;
  /** Column ids that never move (still resizable) — the actions column, and
   * anything else the caller wants pinned to its position. */
  pinnedColumnIds?: string[];
}

/**
 * Thin wrapper around the <table>/<thead>/<tbody> skeleton every TanStack
 * Table consumer in this app renders by hand — styling only, no behavior,
 * except for the opt-in column drag/resize below.
 */
export function DataTable<TData>({
  table,
  emptyMessage,
  className,
  enableColumnCustomization,
  pinnedColumnIds,
}: DataTableProps<TData>) {
  const { t } = useTranslation();
  const columnCount = table.getAllLeafColumns().length;
  const rows = table.getRowModel().rows;
  const pinned = new Set(pinnedColumnIds ?? []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleHeaderDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const order =
      table.getState().columnOrder.length > 0
        ? table.getState().columnOrder
        : table.getAllLeafColumns().map((c) => c.id);
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    table.setColumnOrder(arrayMove(order, oldIndex, newIndex));
  }

  return (
    <div className={clsx("card overflow-x-auto", className)}>
      <table
        className={clsx("divide-y divide-jira-border text-sm", !enableColumnCustomization && "min-w-full")}
        style={enableColumnCustomization ? { width: table.getTotalSize(), tableLayout: "fixed" } : undefined}
      >
        <thead className="bg-jira-panel">
          {table.getHeaderGroups().map((headerGroup) =>
            enableColumnCustomization ? (
              <DndContext
                key={headerGroup.id}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleHeaderDragEnd}
              >
                <SortableContext
                  items={headerGroup.headers.map((h) => h.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <tr>
                    {headerGroup.headers.map((header) => (
                      <SortableHeaderCell
                        key={header.id}
                        header={header}
                        pinned={pinned.has(header.column.id)}
                      />
                    ))}
                  </tr>
                </SortableContext>
              </DndContext>
            ) : (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={clsx(
                        "whitespace-nowrap px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-jira-textSub",
                        sortable && "cursor-pointer select-none hover:text-jira-text",
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === "asc" && " ▲"}
                      {sorted === "desc" && " ▼"}
                    </th>
                  );
                })}
              </tr>
            ),
          )}
        </thead>
        <tbody className="divide-y divide-jira-borderSoft">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-jira-hover">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={clsx(
                    "whitespace-nowrap px-3 py-2 text-jira-text",
                    enableColumnCustomization && "overflow-hidden text-ellipsis",
                  )}
                  style={enableColumnCustomization ? { width: cell.column.getSize() } : undefined}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columnCount} className="px-3 py-8 text-center text-jira-textSub">
                {emptyMessage ?? t("common.noResults")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortableHeaderCell<TData>({
  header,
  pinned,
}: {
  header: Header<TData, unknown>;
  pinned: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: header.column.id,
    disabled: pinned,
  });
  const sortable = header.column.getCanSort();
  const sorted = header.column.getIsSorted();

  return (
    <th
      ref={setNodeRef}
      style={{
        width: header.getSize(),
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={clsx(
        "relative whitespace-nowrap px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-jira-textSub",
        isDragging && "z-10 bg-jira-hover opacity-70",
      )}
    >
      <div
        className={clsx(
          "flex items-center gap-1 overflow-hidden text-ellipsis",
          sortable && "cursor-pointer select-none hover:text-jira-text",
          !pinned && "cursor-grab active:cursor-grabbing",
        )}
        {...(pinned ? {} : { ...attributes, ...listeners })}
        onClick={header.column.getToggleSortingHandler()}
      >
        {flexRender(header.column.columnDef.header, header.getContext())}
        {sorted === "asc" && " ▲"}
        {sorted === "desc" && " ▼"}
      </div>
      {header.column.getCanResize() && (
        <ColumnResizeHandle
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          isResizing={header.column.getIsResizing()}
        />
      )}
    </th>
  );
}
