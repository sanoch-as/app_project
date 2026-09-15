import { Check, ChevronDown } from "lucide-react";
import type { TaskStatus } from "@/types/api";
import { Pill } from "@/components/common/Badge";
import { Dropdown, DropdownItem } from "@/components/common/Dropdown";

const STATUS_OPTIONS: TaskStatus[] = ["not_started", "in_progress", "blocked", "completed"];

const STATUS_TONE: Record<TaskStatus, "gray" | "blue" | "red" | "green"> = {
  not_started: "gray",
  in_progress: "blue",
  blocked: "red",
  completed: "green",
};

interface StatusDropdownBadgeProps {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
}

export function StatusDropdownBadge({ status, onChange, disabled }: StatusDropdownBadgeProps) {
  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={disabled ? undefined : toggle}
          disabled={disabled}
          className="disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pill tone={STATUS_TONE[status]}>
            {status.replace("_", " ")}
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </Pill>
        </button>
      )}
    >
      {({ close }) => (
        <>
          {STATUS_OPTIONS.map((option) => (
            <DropdownItem
              key={option}
              onClick={() => {
                onChange(option);
                close();
              }}
            >
              <span className="flex-1 capitalize">{option.replace("_", " ")}</span>
              {option === status && <Check className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />}
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}
