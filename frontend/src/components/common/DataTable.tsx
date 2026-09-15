import { flexRender, type Table } from "@tanstack/react-table";
import clsx from "clsx";

interface DataTableProps<TData> {
  table: Table<TData>;
  emptyMessage?: string;
  className?: string;
}

/**
 * Thin wrapper around the <table>/<thead>/<tbody> skeleton every TanStack
 * Table consumer in this app renders by hand — styling only, no behavior.
 */
export function DataTable<TData>({ table, emptyMessage = "No results.", className }: DataTableProps<TData>) {
  const columnCount = table.getAllLeafColumns().length;
  const rows = table.getRowModel().rows;

  return (
    <div className={clsx("card overflow-x-auto", className)}>
      <table className="min-w-full divide-y divide-jira-border text-sm">
        <thead className="bg-jira-panel">
          {table.getHeaderGroups().map((headerGroup) => (
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
          ))}
        </thead>
        <tbody className="divide-y divide-jira-borderSoft">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-jira-hover">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="whitespace-nowrap px-3 py-2 text-jira-text">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columnCount} className="px-3 py-8 text-center text-jira-textSub">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
