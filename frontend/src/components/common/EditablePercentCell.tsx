import { useState } from "react";

interface EditablePercentCellProps {
  value: number;
  disabled?: boolean;
  disabledTitle?: string;
  onChange: (value: number) => void;
}

/** Click-to-edit 0-100 number cell, same interaction as EditableDateCell.
 * `disabled` mirrors EditableDateCell's own use for a task with children —
 * its percent_complete is roll-up-computed (services/rollup.py), not
 * directly editable (ADR-030/032). */
export function EditablePercentCell({
  value,
  disabled,
  disabledTitle,
  onChange,
}: EditablePercentCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (disabled) {
    return (
      <span className="text-jira-textSub" title={disabledTitle}>
        {value}%
      </span>
    );
  }

  function commit() {
    const parsed = Number(draft);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.min(100, Math.max(0, parsed));
      if (clamped !== value) onChange(clamped);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        type="number"
        min={0}
        max={100}
        autoFocus
        value={draft}
        className="input w-16 min-w-0 py-0.5 text-xs"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="rounded px-1 py-0.5 hover:bg-jira-hover"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
    >
      {value}%
    </button>
  );
}
