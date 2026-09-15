import clsx from "clsx";
import { stringToColor } from "@/lib/color";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const sizeClasses = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

export function Avatar({ name, size = "md", className }: AvatarProps) {
  const color = stringToColor(name);
  return (
    <span
      title={name}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizeClasses[size],
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </span>
  );
}
