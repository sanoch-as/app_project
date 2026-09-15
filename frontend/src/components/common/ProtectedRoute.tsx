import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/store/authStore";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

/** Gate that only renders children for admins; otherwise shows a message. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  if (role !== "admin") {
    return <div className="card p-6 text-sm text-jira-textSub">{t("common.adminOnly")}</div>;
  }
  return <>{children}</>;
}
