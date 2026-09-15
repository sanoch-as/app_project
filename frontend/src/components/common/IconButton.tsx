import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  "aria-label": string;
  active?: boolean;
  badgeDot?: boolean;
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, active, badgeDot, size = "md", className, ...props },
  ref,
) {
  const dimension = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <button
      ref={ref}
      type="button"
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center rounded-md text-jira-text transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        dimension,
        active ? "bg-jira-blueBadgeBg text-brand-600" : "hover:bg-jira-hover",
        className,
      )}
      {...props}
    >
      <Icon className={iconSize} aria-hidden="true" />
      {badgeDot && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-jira-red" aria-hidden="true" />
      )}
    </button>
  );
});
