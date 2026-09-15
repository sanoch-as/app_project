import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePortfolioSummary } from "@/hooks/useDashboard";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { ProjectStatusBadge, IndexBadge } from "@/components/common/Badge";

export function PortfolioDashboardPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = usePortfolioSummary();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-jira-text">{t("dashboard.title")}</h1>
          <p className="text-sm text-jira-textSub">{t("dashboard.subtitle")}</p>
        </div>
        <Link to="/projects" className="btn-secondary">
          {t("dashboard.manageProjects")}
        </Link>
      </div>

      {isLoading && <LoadingSpinner label={t("dashboard.loadingPortfolio")} />}
      <ErrorMessage error={error} />

      {data && (
        <>
          <div className="mb-4 text-sm text-jira-textSub">
            {t("dashboard.project", { count: data.total_projects })}
          </div>
          {data.projects.length === 0 ? (
            <div className="card p-8 text-center text-sm text-jira-textSub">
              {t("dashboard.noProjectsYet")}{" "}
              <Link to="/projects" className="font-medium text-brand-600 hover:underline">
                {t("dashboard.createOne")}
              </Link>
              .
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.projects.map((p) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}/overview`}
                  className="card block p-4 hover:border-brand-300 hover:shadow-jira-md"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h2 className="font-medium text-jira-text">{p.name}</h2>
                    <ProjectStatusBadge status={p.status} />
                  </div>
                  <div className="mb-3">
                    <div className="mb-1 flex justify-between text-xs text-jira-textSub">
                      <span>{t("dashboard.progress")}</span>
                      <span>{p.percent_complete.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-jira-hover">
                      <div
                        className="h-full rounded-full bg-brand-600"
                        style={{ width: `${Math.min(100, p.percent_complete)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <IndexBadge label="SPI" value={p.spi} />
                    <IndexBadge label="CPI" value={p.cpi} />
                    {p.overdue_task_count > 0 && (
                      <span className="badge-pill normal-case bg-red-50 text-jira-red">
                        {t("dashboard.overdue", { count: p.overdue_task_count })}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
