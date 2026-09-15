import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Bell,
  FolderKanban,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings as SettingsIcon,
  Users as UsersIcon,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useLogout } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useProjects";
import { IconButton } from "@/components/common/IconButton";
import { Button } from "@/components/common/Button";
import { Avatar } from "@/components/common/Avatar";
import { stringToColor } from "@/lib/color";
import { Dropdown, DropdownItem } from "@/components/common/Dropdown";
import { ProjectFormModal } from "@/pages/projects/ProjectFormModal";

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const logout = useLogout();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreateProject, setShowCreateProject] = useState(false);

  // Sessions persisted before this feature shipped have no `language` on
  // `user` (it didn't exist yet) — fall back to the backend's own default.
  useEffect(() => {
    const lang = user?.language ?? "es";
    if (i18n.language !== lang) void i18n.changeLanguage(lang);
  }, [user?.language, i18n]);

  const navItems = useMemo(
    () => [
      { to: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
      { to: "/projects", label: t("nav.projects"), icon: FolderKanban },
      { to: "/reports", label: t("nav.reports"), icon: BarChart3 },
    ],
    [t],
  );

  const { data: projectsPage } = useProjects({ limit: 8 });
  const projects = useMemo(() => {
    const items = projectsPage?.items ?? [];
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((p) => p.name.toLowerCase().includes(q));
  }, [projectsPage, search]);

  const orgInitial = (organization?.name ?? "PM").slice(0, 1).toUpperCase();

  return (
    <div className="flex h-screen flex-col">
      {/* Topbar */}
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-jira-border bg-white px-3 py-2">
        <IconButton
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          onClick={() => setCollapsed((v) => !v)}
        />
        <Link to="/dashboard" className="flex shrink-0 items-center gap-2 px-1">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white"
            aria-hidden="true"
          >
            {orgInitial}
          </span>
          <span className="hidden text-[15px] font-bold tracking-tight text-jira-text sm:inline">
            {organization?.name ?? t("auth.appName")}
          </span>
        </Link>

        <div className="ml-2 flex h-8 max-w-md flex-1 items-center gap-2 rounded-md border border-jira-border bg-jira-panel px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-jira-textSub" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("nav.searchProjects")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-jira-textSub"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {user?.role === "admin" && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={Plus}
              onClick={() => setShowCreateProject(true)}
            >
              {t("nav.create")}
            </Button>
          )}
          <IconButton icon={Bell} aria-label={t("nav.notifications")} />
          <IconButton icon={HelpCircle} aria-label={t("nav.help")} />
          {user?.role === "admin" && (
            <IconButton
              icon={SettingsIcon}
              aria-label={t("nav.settings")}
              onClick={() => navigate("/settings/users")}
            />
          )}
          <div className="mx-1 h-5 w-px bg-jira-border" aria-hidden="true" />
          <Dropdown
            align="right"
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className="flex items-center" aria-label={t("nav.accountMenu")}>
                <Avatar name={user?.full_name ?? user?.email ?? "?"} size="sm" />
              </button>
            )}
          >
            {({ close }) => (
              <>
                <div className="border-b border-jira-border px-3 py-2">
                  <div className="truncate text-sm font-semibold text-jira-text">
                    {user?.full_name}
                  </div>
                  <div className="truncate text-xs text-jira-textSub">{user?.email}</div>
                  <div className="mt-0.5 text-xs text-jira-textSub">
                    {user && t(`enums.userRole.${user.role}`)}
                  </div>
                </div>
                <DropdownItem
                  onClick={() => {
                    close();
                    logout.mutate();
                  }}
                  disabled={logout.isPending}
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("nav.logOut")}
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside
          className={clsx(
            "flex shrink-0 flex-col overflow-y-auto border-r border-jira-border bg-white transition-[width]",
            collapsed ? "w-14" : "w-60",
          )}
        >
          <nav className="space-y-0.5 px-2 py-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium",
                    collapsed && "justify-center px-0",
                    isActive
                      ? "bg-jira-blueBadgeBg text-brand-700"
                      : "text-jira-textSub hover:bg-jira-hover hover:text-jira-text",
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed && item.label}
              </NavLink>
            ))}
            {user?.role === "admin" && (
              <NavLink
                to="/settings/users"
                title={t("nav.users")}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium",
                    collapsed && "justify-center px-0",
                    isActive
                      ? "bg-jira-blueBadgeBg text-brand-700"
                      : "text-jira-textSub hover:bg-jira-hover hover:text-jira-text",
                  )
                }
              >
                <UsersIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed && t("nav.users")}
              </NavLink>
            )}
            <NavLink
              to="/settings/preferences"
              title={t("nav.settings")}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium",
                  collapsed && "justify-center px-0",
                  isActive
                    ? "bg-jira-blueBadgeBg text-brand-700"
                    : "text-jira-textSub hover:bg-jira-hover hover:text-jira-text",
                )
              }
            >
              <SettingsIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed && t("nav.settings")}
            </NavLink>
          </nav>

          {!collapsed && (
            <div className="px-2 pb-3">
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-jira-textSub">
                  {t("nav.projectsSection")}
                </span>
              </div>
              <div className="space-y-0.5">
                {projects.map((project) => (
                  <NavLink
                    key={project.id}
                    to={`/projects/${project.id}/overview`}
                    className={({ isActive }) =>
                      clsx(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
                        isActive
                          ? "bg-jira-blueBadgeBg text-brand-700 font-medium"
                          : "text-jira-textSub hover:bg-jira-hover hover:text-jira-text",
                      )
                    }
                  >
                    <span
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                      style={{ backgroundColor: stringToColor(project.name) }}
                      aria-hidden="true"
                    >
                      {project.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{project.name}</span>
                  </NavLink>
                ))}
                {projects.length === 0 && (
                  <div className="px-2.5 py-1.5 text-xs text-jira-textSub">
                    {t("nav.noProjectsFound")}
                  </div>
                )}
              </div>
              <Link
                to="/projects"
                className="mt-1 block px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:underline"
              >
                {t("nav.viewAllProjects")}
              </Link>
            </div>
          )}

          <div className="mt-auto border-t border-jira-border p-2">
            <button
              type="button"
              className={clsx(
                "btn-secondary w-full",
                collapsed && "px-0",
              )}
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              title={t("nav.logOut")}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {!collapsed && t("nav.logOut")}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>

      {showCreateProject && <ProjectFormModal onClose={() => setShowCreateProject(false)} />}
    </div>
  );
}
