import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "subtle" | "danger" | "link";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "bg-white text-jira-text border border-jira-border hover:bg-jira-hover",
  subtle: "bg-transparent text-jira-textSub hover:bg-jira-hover hover:text-jira-text",
  danger: "bg-jira-red text-white hover:bg-red-700",
  link: "bg-transparent text-brand-600 hover:text-brand-700 hover:underline px-0",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-xs px-2.5 py-1 gap-1",
  md: "text-sm px-3 py-1.5 gap-1.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", iconLeft: IconLeft, iconRight: IconRight, loading, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        IconLeft && <IconLeft className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {children}
      {!loading && IconRight && <IconRight className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
});
