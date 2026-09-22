import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskPriority } from "@/types/api";
import { Pill } from "@/components/common/Badge";
import { Dropdown, DropdownItem } from "@/components/common/Dropdown";

const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high", "critical"];

const PRIORITY_TONE: Record<TaskPriority, "gray" | "blue" | "orange" | "red"> = {
  low: "gray",
  medium: "blue",
  high: "orange",
  critical: "red",
};

interface PriorityDropdownBadgeProps {
  priority: TaskPriority;
  onChange: (priority: TaskPriority) => void;
  disabled?: boolean;
}

/** Same click-to-change pattern as StatusDropdownBadge, for priority. */
export function PriorityDropdownBadge({ priority, onChange, disabled }: PriorityDropdownBadgeProps) {
  const { t } = useTranslation();
  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={disabled ? undefined : toggle}
          disabled={disabled}
          className="disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pill tone={PRIORITY_TONE[priority]}>
            {t(`enums.taskPriority.${priority}`)}
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </Pill>
        </button>
      )}
    >
      {({ close }) => (
        <>
          {PRIORITY_OPTIONS.map((option) => (
            <DropdownItem
              key={option}
              onClick={() => {
                onChange(option);
                close();
              }}
            >
              <span className="flex-1">{t(`enums.taskPriority.${option}`)}</span>
              {option === priority && (
                <Check className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
              )}
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}
