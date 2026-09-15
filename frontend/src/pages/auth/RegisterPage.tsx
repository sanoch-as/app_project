import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRegister } from "@/hooks/useAuth";
import { ErrorMessage } from "@/components/common/ErrorMessage";

export function RegisterPage() {
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
          <div className="text-xl font-bold text-jira-text">PM Platform</div>
          <p className="mt-1 text-sm text-jira-textSub">
            Create your organization &amp; admin account
          </p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="organization_name">
              Organization name
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
              Your full name
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
              Email
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
              Password
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
            <p className="mt-1 text-xs text-jira-textSub">At least 8 characters.</p>
          </div>
          <ErrorMessage error={register.error} />
          <button type="submit" className="btn-primary w-full" disabled={register.isPending}>
            {register.isPending ? "Creating…" : "Create organization"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-jira-textSub">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
