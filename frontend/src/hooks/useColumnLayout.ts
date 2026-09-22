import { useCallback, useState } from "react";

interface ColumnLayout {
  order: string[];
  widths: Record<string, number>;
}

function readLayout(storageKey: string, defaultLayout: ColumnLayout): ColumnLayout {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultLayout;
    const parsed = JSON.parse(raw) as Partial<ColumnLayout>;
    const validOrder =
      Array.isArray(parsed.order) &&
      parsed.order.length === defaultLayout.order.length &&
      defaultLayout.order.every((id) => parsed.order!.includes(id))
        ? parsed.order
        : defaultLayout.order;
    return {
      order: validOrder,
      widths: { ...defaultLayout.widths, ...parsed.widths },
    };
  } catch {
    return defaultLayout;
  }
}

function writeLayout(storageKey: string, layout: ColumnLayout): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Private browsing / storage disabled / quota exceeded — the column
    // layout just won't persist across reloads, nothing else depends on it.
  }
}

/** Per-browser column order + widths for a table (Tasks tab's tree and flat
 * views each get their own `storageKey`). `defaultLayout.order` is also used
 * to validate a stored layout against the table's current column set — if a
 * column was added/removed/renamed since the layout was saved, the stored
 * order is discarded and the default is used instead (widths are merged, so
 * a still-valid subset of stored widths survives). */
export function useColumnLayout(storageKey: string, defaultLayout: ColumnLayout) {
  const [layout, setLayout] = useState<ColumnLayout>(() => readLayout(storageKey, defaultLayout));

  const setOrder = useCallback(
    (order: string[]) => {
      setLayout((prev) => {
        const next = { ...prev, order };
        writeLayout(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const setWidth = useCallback(
    (columnId: string, width: number) => {
      setLayout((prev) => {
        const next = { ...prev, widths: { ...prev.widths, [columnId]: width } };
        writeLayout(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const setWidths = useCallback(
    (widths: Record<string, number>) => {
      setLayout((prev) => {
        const next = { ...prev, widths };
        writeLayout(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const reset = useCallback(() => {
    setLayout(defaultLayout);
    writeLayout(storageKey, defaultLayout);
    // defaultLayout is stable per call site (module-level constant) — safe
    // to omit from deps without pulling in a new effect per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  return { order: layout.order, widths: layout.widths, setOrder, setWidth, setWidths, reset };
}
