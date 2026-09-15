import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLogin } from "@/hooks/useAuth";
import { ErrorMessage } from "@/components/common/ErrorMessage";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: () => {
          const from = (location.state as { from?: Location })?.from?.pathname ?? "/dashboard";
          navigate(from, { replace: true });
        },
      },
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
          <p className="mt-1 text-sm text-jira-textSub">Sign in to your organization</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
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
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <ErrorMessage error={login.error} />
          <button type="submit" className="btn-primary w-full" disabled={login.isPending}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-jira-textSub">
          No account yet?{" "}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">
            Create an organization
          </Link>
        </p>
      </div>
    </div>
  );
}
