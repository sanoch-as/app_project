/**
 * TypeScript types mirroring the backend's Pydantic schemas, derived from the
 * live OpenAPI schema (GET /openapi.json) served by the FastAPI app in
 * backend/src/app — not hand-guessed. Keep this file in sync with the backend
 * schemas/ package whenever the API changes.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type UserRole = "admin" | "member";

export type Language = "es" | "en";

export type DateFormat = "iso" | "dmy";

export type ProjectStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";

export type TaskStatus = "not_started" | "in_progress" | "blocked" | "completed";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type DependencyType = "FS" | "SS" | "FF" | "SF";

// ---------------------------------------------------------------------------
// Pagination / error envelopes (docs/api-conventions.md)
// ---------------------------------------------------------------------------

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiErrorBody {
  detail: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Auth / organizations / users
// ---------------------------------------------------------------------------

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface OrganizationRead {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface UserRead {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  cost_per_hour: number | null;
  is_active: boolean;
  language: Language;
  date_format: DateFormat;
  created_at: string;
  updated_at: string;
}

export interface RegisterRequest {
  organization_name: string;
  full_name: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  organization: OrganizationRead;
  user: UserRead;
  tokens: TokenPair;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface LogoutRequest {
  refresh_token: string;
}

export interface UserInvite {
  email: string;
  full_name: string;
  role?: UserRole;
  cost_per_hour?: number | null;
  password: string;
}

export interface UserUpdate {
  full_name?: string | null;
  cost_per_hour?: number | null;
  is_active?: boolean | null;
  role?: UserRole | null;
  language?: Language | null;
  date_format?: DateFormat | null;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectRead {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  working_days_per_week: number;
  standard_hours_per_day: number;
  holidays: string[];
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  working_days_per_week?: number;
  standard_hours_per_day?: number;
  holidays?: string[];
}

export interface ProjectUpdate {
  name?: string | null;
  description?: string | null;
  status?: ProjectStatus | null;
  start_date?: string | null;
  end_date?: string | null;
  working_days_per_week?: number | null;
  standard_hours_per_day?: number | null;
  holidays?: string[] | null;
}

export interface ProjectMemberRead {
  id: string;
  project_id: string;
  user: UserRead;
}

export interface ProjectMemberCreate {
  user_id: string;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface TaskAssigneeInput {
  user_id: string;
  allocation_percent?: number;
}

export interface TaskAssigneeRead {
  user: UserRead;
  allocation_percent: number;
}

export interface TaskRead {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  name: string;
  description: string | null;
  wbs_code: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  percent_complete: number;
  status: TaskStatus;
  priority: TaskPriority;
  is_milestone: boolean;
  estimated_hours: number | null;
  budgeted_cost: number;
  early_start: string | null;
  early_finish: string | null;
  late_start: string | null;
  late_finish: string | null;
  total_float: number | null;
  is_critical: boolean;
  assignees: TaskAssigneeRead[];
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  parent_task_id?: string | null;
  name: string;
  description?: string | null;
  start_date: string;
  duration_days: number;
  is_milestone?: boolean;
  priority?: TaskPriority;
  estimated_hours?: number | null;
  budgeted_cost?: number;
  assignees?: TaskAssigneeInput[];
}

export interface TaskUpdate {
  name?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_days?: number | null;
  percent_complete?: number | null;
  status?: TaskStatus | null;
  priority?: TaskPriority | null;
  is_milestone?: boolean | null;
  estimated_hours?: number | null;
  budgeted_cost?: number | null;
  assignees?: TaskAssigneeInput[] | null;
}

export interface TaskMove {
  parent_task_id: string | null;
  position: number;
}

// ---------------------------------------------------------------------------
// Dependencies / Gantt
// ---------------------------------------------------------------------------

export interface DependencyRead {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: DependencyType;
  lag_days: number;
}

export interface DependencyCreate {
  successor_id: string;
  dependency_type?: DependencyType;
  lag_days?: number;
}

export interface GanttResponse {
  tasks: TaskRead[];
  dependencies: DependencyRead[];
}

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------

export interface BaselineTaskRead {
  task_id: string;
  planned_start_date: string;
  planned_end_date: string;
  planned_cost: number;
}

export interface BaselineRead {
  id: string;
  project_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  baseline_tasks: BaselineTaskRead[];
}

export interface BaselineCreate {
  name: string;
}

// ---------------------------------------------------------------------------
// Worklogs
// ---------------------------------------------------------------------------

export interface WorklogRead {
  id: string;
  task_id: string;
  user_id: string;
  work_date: string;
  hours: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorklogCreate {
  work_date: string;
  hours: number;
  description?: string | null;
}

export interface WorklogUpdate {
  work_date?: string | null;
  hours?: number | null;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export interface TaskCommentRead {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface TaskCommentCreate {
  body: string;
}

// ---------------------------------------------------------------------------
// Progress / EVM / S-curve
// ---------------------------------------------------------------------------

export interface EVMMetricsRead {
  pv: number;
  ev: number;
  ac: number;
  spi: number | null;
  cpi: number | null;
}

export interface SCurvePointRead {
  week_ending: string;
  pv: number;
  ev: number;
  ac: number;
  spi: number | null;
  cpi: number | null;
}

export interface ProgressResponse {
  status_date: string;
  current: EVMMetricsRead;
  s_curve: SCurvePointRead[];
}

export interface RecalculateResponse {
  status_date: string;
  current: EVMMetricsRead;
}

export interface TaskPlannedProgressRead {
  task_id: string;
  wbs_code: string;
  name: string;
  status: TaskStatus;
  planned_start_date: string | null;
  planned_end_date: string | null;
  planned_percent_complete: number;
  actual_percent_complete: number;
}

export interface ProjectedProgressResponse {
  status_date: string;
  baseline_id: string | null;
  baseline_name: string | null;
  project_planned_percent_complete: number | null;
  project_actual_percent_complete: number;
  project_planned_percent_complete_by_duration: number | null;
  project_actual_percent_complete_by_duration: number;
  tasks: TaskPlannedProgressRead[];
}

export interface PercentCompleteSeriesPointRead {
  checkpoint: string;
  planned_percent_complete: number | null;
  actual_percent_complete: number | null;
  planned_percent_complete_by_duration: number | null;
  actual_percent_complete_by_duration: number | null;
}

export interface PercentCompleteHistoryResponse {
  start_date: string;
  end_date: string;
  interval_days: number;
  points: PercentCompleteSeriesPointRead[];
}

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

export interface PortfolioProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  percent_complete: number;
  spi: number | null;
  cpi: number | null;
  overdue_task_count: number;
}

export interface DashboardSummary {
  total_projects: number;
  projects: PortfolioProjectSummary[];
}

export interface OverdueTask {
  id: string;
  name: string;
  end_date: string;
  status: TaskStatus;
}

export interface UpcomingMilestone {
  id: string;
  name: string;
  start_date: string;
}

export interface ProjectDashboard {
  project_id: string;
  percent_complete: number;
  spi: number | null;
  cpi: number | null;
  overdue_tasks: OverdueTask[];
  upcoming_milestones: UpcomingMilestone[];
}

// ---------------------------------------------------------------------------
// Reports export
// ---------------------------------------------------------------------------

export type ExportType = "tasks" | "worklogs" | "summary";
