import type { ProjectRead, TaskRead } from "@/types/api";
import type { RoadmapScale } from "@/hooks/useRoadmapPreferences";

const ONE_DAY_MS = 86_400_000;

/** Parses a `YYYY-MM-DD` API date as local midnight, not UTC — `new
 * Date(iso)` treats a bare date string as UTC, which shifts it a day
 * backwards in any timezone behind UTC (see ProjectForecastTab.tsx's
 * `addDays` for the same idiom already used elsewhere in this app). */
export function parseIsoDateLocal(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function todayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Inverse of `parseIsoDateLocal` — formats a local `Date` back to
 * `YYYY-MM-DD` using its local calendar fields (not `toISOString`, which
 * would convert through UTC and risk the same off-by-one). */
export function toIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function endOfCalendarMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function clampDate(date: Date, min: Date, max: Date): Date {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

export interface RoadmapRange {
  start: Date;
  end: Date;
}

/** The overall date span the roadmap covers: the min/max of whatever tasks
 * are currently on the timeline, falling back to the project's own
 * start/end date when nothing has been added yet, and `null` (→ empty
 * state) when neither is available. */
export function computeOverallRange(
  onTimelineTasks: TaskRead[],
  project: ProjectRead,
): RoadmapRange | null {
  if (onTimelineTasks.length > 0) {
    const dates = onTimelineTasks.flatMap((t) => [
      parseIsoDateLocal(t.start_date),
      parseIsoDateLocal(t.end_date),
    ]);
    return {
      start: dates.reduce((min, d) => (d < min ? d : min)),
      end: dates.reduce((max, d) => (d > max ? d : max)),
    };
  }
  if (project.start_date && project.end_date) {
    return {
      start: parseIsoDateLocal(project.start_date),
      end: parseIsoDateLocal(project.end_date),
    };
  }
  return null;
}

export interface RoadmapColumn {
  label: string;
  startDate: Date;
  endDate: Date; // inclusive
}

/** Buckets `range` into equal-concept columns (weekly/biweekly/calendar
 * months) — the last column is truncated to `range.end`, so it can be a
 * shorter real span than the others while still rendering as one grid
 * track (see `dateToColumnFraction`, which positions by column-index units
 * rather than raw day fractions so bars still line up with the grid). */
export function buildColumns(range: RoadmapRange, scale: RoadmapScale): RoadmapColumn[] {
  const { start, end } = range;
  const columns: RoadmapColumn[] = [];
  let cursor = start;
  let n = 1;
  if (scale === "monthly") {
    while (cursor <= end) {
      const monthEnd = endOfCalendarMonth(cursor);
      columns.push({ label: String(n), startDate: cursor, endDate: monthEnd < end ? monthEnd : end });
      cursor = startOfNextMonth(cursor);
      n++;
    }
  } else {
    const stepDays = scale === "weekly" ? 7 : 14;
    while (cursor <= end) {
      const colEnd = addDays(cursor, stepDays - 1);
      columns.push({ label: String(n), startDate: cursor, endDate: colEnd < end ? colEnd : end });
      cursor = addDays(cursor, stepDays);
      n++;
    }
  }
  if (columns.length === 0) columns.push({ label: "1", startDate: start, endDate: end });
  return columns;
}

/** Maps a date to a 0..1 fraction across the whole column grid, in
 * column-index units (not raw day-of-range units) — so a bar edge always
 * lines up with a column boundary even though the last column can be a
 * shorter real span than the rest. */
export function dateToColumnFraction(date: Date, columns: RoadmapColumn[]): number {
  if (columns.length === 0) return 0;
  const clamped = clampDate(date, columns[0].startDate, columns[columns.length - 1].endDate);
  let idx = columns.findIndex((c) => clamped >= c.startDate && clamped <= c.endDate);
  if (idx === -1) idx = columns.length - 1;
  const col = columns[idx];
  const colSpanMs = col.endDate.getTime() - col.startDate.getTime() + ONE_DAY_MS;
  const intraFraction = (clamped.getTime() - col.startDate.getTime()) / colSpanMs;
  return (idx + intraFraction) / columns.length;
}

export function dateRangeToBarStyle(
  startIso: string,
  endIso: string,
  columns: RoadmapColumn[],
): { leftPercent: number; widthPercent: number } {
  const left = dateToColumnFraction(parseIsoDateLocal(startIso), columns) * 100;
  const right = dateToColumnFraction(parseIsoDateLocal(endIso), columns) * 100;
  return { leftPercent: left, widthPercent: Math.max(right - left, 1.5) };
}

/** Which column "today" falls in (1-based), and the total column count —
 * drives the "Semana X de Y" style header. Clamped to the first/last
 * column when today is outside the roadmap's own range. */
export function currentColumnPosition(
  columns: RoadmapColumn[],
  today: Date,
): { current: number; total: number } {
  const total = columns.length;
  if (total === 0) return { current: 0, total: 0 };
  let idx = columns.findIndex((c) => today >= c.startDate && today <= c.endDate);
  if (idx === -1) idx = today < columns[0].startDate ? 0 : total - 1;
  return { current: idx + 1, total };
}

export function totalWeeksSpanned(range: RoadmapRange): number {
  const days = Math.round((range.end.getTime() - range.start.getTime()) / ONE_DAY_MS) + 1;
  return Math.ceil(days / 7);
}

export type PhaseColorState = "pending" | "in_progress" | "completed";

/** A WBS-parent "phase" task's own `status` field isn't rollup-maintained
 * (only dates/cost/percent_complete are, see rollup.py/ADR-037), so the
 * roadmap bar's color is derived from `percent_complete` instead. */
export function derivePhaseColorState(percentComplete: number): PhaseColorState {
  if (percentComplete >= 100) return "completed";
  if (percentComplete <= 0) return "pending";
  return "in_progress";
}

// ---------------------------------------------------------------------------
// WBS tree helpers — same shape as TaskTreeTable.tsx's childrenByParentOf/
// buildRows, replicated here since it isn't exported as a shared utility.
// ---------------------------------------------------------------------------

function siblingIndex(task: TaskRead): number {
  const segment = task.wbs_code.split(".").pop();
  const parsed = segment ? Number(segment) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export type ChildrenIndex = Map<string | null, TaskRead[]>;

export function buildChildrenIndex(tasks: TaskRead[]): ChildrenIndex {
  const map: ChildrenIndex = new Map();
  for (const task of tasks) {
    const siblings = map.get(task.parent_task_id) ?? [];
    siblings.push(task);
    map.set(task.parent_task_id, siblings);
  }
  for (const siblings of map.values()) siblings.sort((a, b) => siblingIndex(a) - siblingIndex(b));
  return map;
}

export interface IndentedTaskRow {
  task: TaskRead;
  depth: number;
}

/** How many of a roadmap task's WBS ancestors (any distance up, not just
 * its immediate parent) are *also* on the timeline — drives a small visual
 * indent so a manually-added sub-task still reads as nested under its
 * on-timeline parent, instead of looking like an unrelated flat sibling. */
export function computeRoadmapDepths(
  tasks: TaskRead[],
  onTimelineIds: Set<string>,
): Map<string, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depths = new Map<string, number>();
  for (const task of tasks) {
    if (!onTimelineIds.has(task.id)) continue;
    let depth = 0;
    let ancestorId = task.parent_task_id;
    while (ancestorId) {
      if (onTimelineIds.has(ancestorId)) depth++;
      ancestorId = byId.get(ancestorId)?.parent_task_id ?? null;
    }
    depths.set(task.id, depth);
  }
  return depths;
}

export function buildIndentedRows(childrenIndex: ChildrenIndex): IndentedTaskRow[] {
  const rows: IndentedTaskRow[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const task of childrenIndex.get(parentId) ?? []) {
      rows.push({ task, depth });
      visit(task.id, depth + 1);
    }
  }
  visit(null, 0);
  return rows;
}

/** Every milestone (any depth) descending from `rootTaskId` — "los hitos de
 * esa fase", sorted by start date. */
export function collectDescendantMilestones(
  childrenIndex: ChildrenIndex,
  rootTaskId: string,
): TaskRead[] {
  const result: TaskRead[] = [];
  function visit(parentId: string) {
    for (const child of childrenIndex.get(parentId) ?? []) {
      if (child.is_milestone) result.push(child);
      visit(child.id);
    }
  }
  visit(rootTaskId);
  return result.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/** One-click default for a project that has never configured its roadmap:
 * the direct children of the single Jira-import root task if one exists,
 * otherwise every real top-level task — either way, excluding milestones
 * (those are shown via the separate global toggle, never individually
 * added to the timeline). */
export function suggestDefaultOnTimelineIds(
  tasks: TaskRead[],
  jiraProjectRootKey: string,
): string[] {
  const roots = tasks.filter((t) => t.parent_task_id === null);
  if (roots.length === 1 && roots[0].external_key === jiraProjectRootKey) {
    const rootId = roots[0].id;
    return tasks
      .filter((t) => t.parent_task_id === rootId && !t.is_milestone)
      .map((t) => t.id);
  }
  return roots.filter((t) => !t.is_milestone).map((t) => t.id);
}
