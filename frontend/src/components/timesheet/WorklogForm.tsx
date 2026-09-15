import { useState, type FormEvent } from "react";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import type { WorklogCreate, WorklogRead } from "@/types/api";

interface WorklogFormProps {
  initial?: WorklogRead;
  onSubmit: (payload: WorklogCreate) => void;
  onCancel?: () => void;
  isPending?: boolean;
  error?: unknown;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function WorklogForm({ initial, onSubmit, onCancel, isPending, error }: WorklogFormProps) {
  const [workDate, setWorkDate] = useState(initial?.work_date ?? today());
  const [hours, setHours] = useState(initial?.hours?.toString() ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      work_date: workDate,
      hours: Number(hours),
      description: description.trim() === "" ? null : description,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="work_date">
            Date
          </label>
          <input
            id="work_date"
            type="date"
            required
            className="input"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="hours">
            Hours
          </label>
          <input
            id="hours"
            type="number"
            required
            min={0.1}
            max={24}
            step={0.25}
            className="input"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="description">
          Description (optional)
        </label>
        <textarea
          id="description"
          className="input"
          rows={2}
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <ErrorMessage error={error} />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "Saving…" : initial ? "Save changes" : "Log hours"}
        </button>
      </div>
    </form>
  );
}
