import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dropdown, DropdownItem } from "@/components/common/Dropdown";
import type { TaskAssigneeInput, TaskAssigneeRead, UserRead } from "@/types/api";

interface AssigneePickerCellProps {
  assignees: TaskAssigneeRead[];
  members: UserRead[];
  onChange: (assignees: TaskAssigneeInput[]) => void;
  /** True while a previous toggle's mutation for this same task is still in
   * flight — each toggle recomputes the full assignee list from the current
   * `assignees` prop, so firing a second toggle before the first's response
   * lands would silently overwrite it (last request wins). Disabling the
   * checkboxes until the round trip completes closes that window. */
  disabled?: boolean;
}

/** Inline multi-select of "who's assigned" — a simple checklist, no
 * allocation_percent editing (new assignees default to 100%; adjusting an
 * existing assignee's allocation still requires the full task modal). */
export function AssigneePickerCell({ assignees, members, onChange, disabled }: AssigneePickerCellProps) {
  const { t } = useTranslation();
  const assignedIds = new Set(assignees.map((a) => a.user.id));

  function toggle(userId: string) {
    if (disabled) return;
    if (assignedIds.has(userId)) {
      onChange(
        assignees
          .filter((a) => a.user.id !== userId)
          .map((a) => ({ user_id: a.user.id, allocation_percent: a.allocation_percent })),
      );
    } else {
      onChange([
        ...assignees.map((a) => ({ user_id: a.user.id, allocation_percent: a.allocation_percent })),
        { user_id: userId, allocation_percent: 100 },
      ]);
    }
  }

  const label = assignees.length > 0 ? assignees.map((a) => a.user.full_name).join(", ") : "—";

  return (
    <Dropdown
      trigger={({ toggle: toggleOpen }) => (
        <button
          type="button"
          onClick={toggleOpen}
          className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-xs text-jira-textSub hover:bg-jira-hover"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        </button>
      )}
    >
      {() =>
        members.length === 0 ? (
          <div className="px-3 py-1.5 text-xs text-jira-textSub">{t("tasks.form.noMembersYet")}</div>
        ) : (
          members.map((m) => (
            <DropdownItem key={m.id} onClick={() => toggle(m.id)} disabled={disabled}>
              <input type="checkbox" checked={assignedIds.has(m.id)} readOnly className="h-3.5 w-3.5" />
              <span className="flex-1 truncate">{m.full_name}</span>
            </DropdownItem>
          ))
        )
      }
    </Dropdown>
  );
}
