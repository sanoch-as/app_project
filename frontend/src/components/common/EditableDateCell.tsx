import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDateFormat } from "@/hooks/useDateFormat";

interface EditableDateCellProps {
  value: string;
  disabled?: boolean;
  disabledTitle?: string;
  onChange: (value: string) => void;
}

/** Click-to-edit date cell (Tasks table — WBS hierarchy): click opens a native
 * date picker inline, same one-field-immediate-commit pattern as
 * StatusDropdownBadge. Read-only (plain text) for a task with subtasks, whose
 * dates are computed by roll-up (services/rollup.py). */
export function EditableDateCell({ value, disabled, disabledTitle, onChange }: EditableDateCellProps) {
  const { t } = useTranslation();
  const formatDate = useDateFormat();
  const [editing, setEditing] = useState(false);

  if (disabled) {
    return (
      <span className="text-jira-textSub" title={disabledTitle}>
        {formatDate(value)}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value}
        className="input w-full min-w-0 py-0.5 text-xs"
        onChange={(e) => {
          // The native date input fires `change` as soon as one segment
          // (day/month/year) is filled in, with an empty value until every
          // segment is — closing the editor here would kick the user out
          // mid-type, so only commit (and close) once the date is complete.
          if (e.target.value && e.target.value !== value) {
            onChange(e.target.value);
            setEditing(false);
          }
        }}
        onBlur={() => setEditing(false)}
      />
    );
  }

  return (
    <button
      type="button"
      className="rounded px-1 py-0.5 hover:bg-jira-hover"
      onClick={() => setEditing(true)}
      aria-label={t("tasks.table.editDate")}
    >
      {formatDate(value)}
    </button>
  );
}
