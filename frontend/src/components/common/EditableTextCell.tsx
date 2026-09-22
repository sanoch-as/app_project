import { useState } from "react";
import clsx from "clsx";

interface EditableTextCellProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Click-to-edit single-line text cell — same interaction as
 * EditableDateCell/EditablePercentCell: click to open a plain input,
 * Enter/blur commits, Escape cancels. Never disabled (unlike dates/percent,
 * a task's name is never roll-up-derived). */
export function EditableTextCell({ value, onChange, className }: EditableTextCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onChange(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        className="input w-full min-w-0 py-0.5 text-xs"
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
      className={clsx("truncate rounded px-1 py-0.5 text-left hover:bg-jira-hover", className)}
      title={value}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value}
    </button>
  );
}
