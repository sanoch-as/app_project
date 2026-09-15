import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRegister } from "@/hooks/useAuth";
import { ErrorMessage } from "@/components/common/ErrorMessage";

export function RegisterPage() {
  const { t } = useTranslation();
  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const register = useRegister();
  const navigate = useNavigate();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    register.mutate(
      { organization_name: organizationName, full_name: fullName, email, password },
      { onSuccess: () => navigate("/dashboard", { replace: true }) },
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-jira-panel px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white">
            P
          </span>
          <div className="text-xl font-bold text-jira-text">{t("auth.appName")}</div>
          <p className="mt-1 text-sm text-jira-textSub">{t("auth.registerSubtitle")}</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="organization_name">
              {t("auth.organizationName")}
            </label>
            <input
              id="organization_name"
              required
              className="input"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="full_name">
              {t("auth.yourFullName")}
            </label>
            <input
              id="full_name"
              required
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="email">
              {t("auth.email")}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-jira-textSub">{t("auth.passwordHint")}</p>
          </div>
          <ErrorMessage error={register.error} />
          <button type="submit" className="btn-primary w-full" disabled={register.isPending}>
            {register.isPending ? t("auth.creating") : t("auth.createOrganizationButton")}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-jira-textSub">
          {t("auth.alreadyHaveAccount")}{" "}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            {t("auth.signInLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
