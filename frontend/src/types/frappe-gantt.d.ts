/**
 * frappe-gantt (ADR-008) ships no TypeScript declarations (verified: its
 * published package has no .d.ts files). This is a minimal hand-written
 * declaration covering only the surface area components/gantt/GanttChart.tsx
 * actually uses, derived by reading node_modules/frappe-gantt/src/index.js
 * directly (constructor, setup_options defaults, and the on_click /
 * on_date_change / on_progress_change / on_view_change callbacks wired via
 * trigger_event).
 */
declare module "frappe-gantt" {
  export interface GanttTask {
    id: string;
    name: string;
    start: string;
    end: string;
    progress?: number;
    dependencies?: string;
    custom_class?: string;
    [key: string]: unknown;
  }

  export type GanttViewMode =
    | "Quarter Day"
    | "Half Day"
    | "Day"
    | "Week"
    | "Month"
    | "Year";

  export interface GanttOptions {
    header_height?: number;
    column_width?: number;
    step?: number;
    view_modes?: string[];
    bar_height?: number;
    bar_corner_radius?: number;
    arrow_curve?: number;
    padding?: number;
    view_mode?: GanttViewMode;
    date_format?: string;
    popup_trigger?: string;
    custom_popup_html?: ((task: GanttTask) => string) | null;
    language?: string;
    on_click?: (task: GanttTask) => void;
    on_date_change?: (task: GanttTask, start: Date, end: Date) => void;
    on_progress_change?: (task: GanttTask, progress: number) => void;
    on_view_change?: (mode: GanttViewMode) => void;
  }

  export default class Gantt {
    constructor(
      wrapper: string | HTMLElement | SVGElement,
      tasks: GanttTask[],
      options?: GanttOptions,
    );
    refresh(tasks: GanttTask[]): void;
    change_view_mode(mode?: GanttViewMode): void;
    static VIEW_MODE: Record<string, GanttViewMode>;
  }
}
