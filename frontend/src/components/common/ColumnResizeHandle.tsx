import clsx from "clsx";

interface ColumnResizeHandleProps {
  onMouseDown?: React.MouseEventHandler;
  onTouchStart?: React.TouchEventHandler;
  isResizing?: boolean;
}

/** Thin draggable divider at a header cell's right edge — the parent header
 * cell must be `position: relative`. Resize math (start position, min
 * width, persistence) lives with the caller; this is purely the hit target
 * + visual affordance, shared by the tree and flat Task table headers.
 * Mouse + touch (not pointer events) to match
 * `@tanstack/react-table`'s own `header.getResizeHandler()` shape, which
 * the flat table passes straight through. */
export function ColumnResizeHandle({ onMouseDown, onTouchStart, isResizing }: ColumnResizeHandleProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className={clsx(
        "absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none",
        isResizing ? "bg-brand-600" : "hover:bg-brand-400",
      )}
    />
  );
}
