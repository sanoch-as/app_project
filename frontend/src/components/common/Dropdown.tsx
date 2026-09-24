import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
}

interface PanelPosition {
  top: number;
  left?: number;
  right?: number;
}

/** The panel portals to `document.body` and is positioned from the
 * trigger's `getBoundingClientRect()` instead of being an absolutely
 * positioned child of the trigger — every place this renders inside a
 * scrolling table/panel (e.g. TaskTreeTable) sits under an ancestor whose
 * `overflow-x-auto` also computes `overflow-y` as `auto` per the CSS spec
 * (any axis left "visible" next to a non-"visible" one is forced to
 * "auto"), which silently clips an in-tree absolute panel that opens near
 * the bottom of the list. */
export function Dropdown({ trigger, children, align = "left", panelClassName }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [flipped, setFlipped] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function openDropdown() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(
      align === "right"
        ? { top: rect.bottom + 4, right: window.innerWidth - rect.right }
        : { top: rect.bottom + 4, left: rect.left },
    );
    setFlipped(false);
    setOpen(true);
  }

  // Flip above the trigger when the panel would otherwise overflow the
  // viewport's bottom edge (guarded by `flipped` so this runs at most once
  // per open — it would otherwise re-trigger itself every time it moves).
  useLayoutEffect(() => {
    if (!open || flipped || !panelRef.current || !triggerRef.current) return;
    const panelRect = panelRef.current.getBoundingClientRect();
    if (panelRect.bottom > window.innerHeight - 8) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      setPosition((prev) =>
        prev ? { ...prev, top: triggerRect.top - panelRect.height - 4 } : prev,
      );
    }
    setFlipped(true);
  }, [open, flipped]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // A scrolling ancestor (e.g. AppLayout's <main>) doesn't move the
    // fixed-position panel with it — closing on scroll is simpler and more
    // robust than re-tracking position on every scroll tick. `capture:
    // true` catches scroll events from any nested scroll container, since
    // `scroll` doesn't bubble but is still observable in the capture phase.
    // Scrolling *inside* the panel itself (e.g. a long list, or the emoji
    // picker's own internal scroll area) must NOT close it — without this
    // check, the very act of scrolling the panel's content closed it
    // before the scroll could register at all.
    function onScroll(event: Event) {
      if (panelRef.current && event.target instanceof Node && panelRef.current.contains(event.target)) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <div ref={triggerRef} className="relative inline-block">
      {trigger({ open, toggle: () => (open ? setOpen(false) : openDropdown()) })}
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: position.top, left: position.left, right: position.right }}
            className={clsx(
              "z-[60] min-w-[10rem] rounded-md border border-jira-border bg-white py-1 shadow-jira-md",
              panelClassName,
            )}
          >
            {children({ close: () => setOpen(false) })}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function DropdownItem({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={clsx(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-jira-text hover:bg-jira-hover disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
