import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { useAuthStore } from "@/store/authStore";
import { useLogout } from "@/hooks/useAuth";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/projects", label: "Projects", icon: "📁" },
  { to: "/reports", label: "Reports", icon: "🧾" },
];

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const logout = useLogout();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="text-sm font-semibold text-slate-900">
            {organization?.name ?? "PM Platform"}
          </div>
          <div className="text-xs text-slate-500">{user?.email}</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100",
                )
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          {user?.role === "admin" && (
            <NavLink
              to="/settings/users"
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100",
                )
              }
            >
              <span aria-hidden="true">👤</span>
              Users
            </NavLink>
          )}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span className="capitalize">{user?.role}</span>
          </div>
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
