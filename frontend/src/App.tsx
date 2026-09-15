import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/common/AppLayout";
import { ProtectedRoute } from "@/components/common/ProtectedRoute";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { PortfolioDashboardPage } from "@/pages/dashboard/PortfolioDashboardPage";
import { ProjectsListPage } from "@/pages/projects/ProjectsListPage";
import { ProjectDetailPage } from "@/pages/projects/ProjectDetailPage";
import { ProjectOverviewTab } from "@/pages/projects/ProjectOverviewTab";
import { ProjectGanttTab } from "@/pages/projects/ProjectGanttTab";
import { ProjectTasksTab } from "@/pages/projects/ProjectTasksTab";
import { ProjectKanbanTab } from "@/pages/projects/ProjectKanbanTab";
import { ProjectCalendarTab } from "@/pages/projects/ProjectCalendarTab";
import { ProjectBaselinesTab } from "@/pages/projects/ProjectBaselinesTab";
import { ProjectForecastTab } from "@/pages/projects/ProjectForecastTab";
import { ProjectWorklogsTab } from "@/pages/projects/ProjectWorklogsTab";
import { ProjectMembersTab } from "@/pages/projects/ProjectMembersTab";
import { ProjectReportsTab } from "@/pages/projects/ProjectReportsTab";
import { WorklogsReportPage } from "@/pages/reports/WorklogsReportPage";
import { UsersSettingsPage } from "@/pages/settings/UsersSettingsPage";
import { PreferencesSettingsPage } from "@/pages/settings/PreferencesSettingsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<PortfolioDashboardPage />} />
        <Route path="/projects" element={<ProjectsListPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<ProjectOverviewTab />} />
          <Route path="gantt" element={<ProjectGanttTab />} />
          <Route path="tasks" element={<ProjectTasksTab />} />
          <Route path="kanban" element={<ProjectKanbanTab />} />
          <Route path="calendar" element={<ProjectCalendarTab />} />
          <Route path="baselines" element={<ProjectBaselinesTab />} />
          <Route path="forecast" element={<ProjectForecastTab />} />
          <Route path="worklogs" element={<ProjectWorklogsTab />} />
          <Route path="members" element={<ProjectMembersTab />} />
          <Route path="reports" element={<ProjectReportsTab />} />
        </Route>
        <Route path="/reports" element={<WorklogsReportPage />} />
        <Route path="/settings/users" element={<UsersSettingsPage />} />
        <Route path="/settings/preferences" element={<PreferencesSettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
