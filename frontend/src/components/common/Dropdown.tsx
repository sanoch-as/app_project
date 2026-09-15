import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
}

export function Dropdown({ trigger, children, align = "left", panelClassName }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={clsx(
            "absolute z-20 mt-1 min-w-[10rem] rounded-md border border-jira-border bg-white py-1 shadow-jira-md",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children({ close: () => setOpen(false) })}
        </div>
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
