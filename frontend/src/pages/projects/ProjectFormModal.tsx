import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { useCreateProject, useUpdateProject } from "@/hooks/useProjects";
import type { ProjectRead, ProjectStatus } from "@/types/api";

interface ProjectFormModalProps {
  initial?: ProjectRead;
  onClose: () => void;
  onSaved?: (projectId: string) => void;
}

const STATUSES: ProjectStatus[] = ["planning", "active", "on_hold", "completed", "cancelled"];

function parseHolidays(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function ProjectFormModal({ initial, onClose, onSaved }: ProjectFormModalProps) {
  const { t } = useTranslation();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject(initial?.id ?? "");

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? "planning");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [workingDaysPerWeek, setWorkingDaysPerWeek] = useState(initial?.working_days_per_week ?? 5);
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(initial?.standard_hours_per_day ?? 8);
  const [holidaysText, setHolidaysText] = useState((initial?.holidays ?? []).join(", "));

  const mutation = initial ? updateProject : createProject;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const shared = {
      name,
      description: description.trim() === "" ? null : description,
      start_date: startDate === "" ? null : startDate,
      end_date: endDate === "" ? null : endDate,
      working_days_per_week: workingDaysPerWeek,
      standard_hours_per_day: standardHoursPerDay,
      holidays: parseHolidays(holidaysText),
    };

    if (initial) {
      updateProject.mutate(
        { ...shared, status },
        { onSuccess: (project) => { onSaved?.(project.id); onClose(); } },
      );
    } else {
      createProject.mutate(shared, {
        onSuccess: (project) => { onSaved?.(project.id); onClose(); },
      });
    }
  }

  return (
    <Modal
      title={initial ? t("projects.form.editTitle") : t("projects.form.newTitle")}
      onClose={onClose}
      widthClassName="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="project_name">
            {t("common.name")}
          </label>
          <input
            id="project_name"
            required
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="project_description">
            {t("common.description")}
          </label>
          <textarea
            id="project_description"
            rows={2}
            className="input"
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {initial && (
          <div>
            <label className="label" htmlFor="project_status">
              {t("common.status")}
            </label>
            <select
              id="project_status"
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`enums.projectStatus.${s}`)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="start_date">
              {t("common.startDate")}
            </label>
            <input
              id="start_date"
              type="date"
              className="input"
              value={startDate ?? ""}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="end_date">
              {t("common.endDate")}
            </label>
            <input
              id="end_date"
              type="date"
              className="input"
              value={endDate ?? ""}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="working_days_per_week">
              {t("projects.form.workingDaysPerWeek")}
            </label>
            <input
              id="working_days_per_week"
              type="number"
              min={1}
              max={7}
              className="input"
              value={workingDaysPerWeek}
              onChange={(e) => setWorkingDaysPerWeek(Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-jira-textSub">{t("projects.form.workingDaysHint")}</p>
          </div>
          <div>
            <label className="label" htmlFor="standard_hours_per_day">
              {t("projects.form.standardHoursPerDay")}
            </label>
            <input
              id="standard_hours_per_day"
              type="number"
              min={0.1}
              max={24}
              step={0.5}
              className="input"
              value={standardHoursPerDay}
              onChange={(e) => setStandardHoursPerDay(Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="holidays">
            {t("projects.form.holidays")}
          </label>
          <input
            id="holidays"
            className="input"
            placeholder="2026-12-25, 2026-01-01"
            value={holidaysText}
            onChange={(e) => setHolidaysText(e.target.value)}
          />
        </div>

        <ErrorMessage error={mutation.error} />

        <div className="flex justify-end gap-2 border-t border-jira-borderSoft pt-3">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending
              ? t("common.saving")
              : initial
                ? t("common.saveChanges")
                : t("projects.form.createProject")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
