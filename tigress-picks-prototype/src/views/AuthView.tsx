import { useState } from "react";
import { type ApiError } from "../lib/api";
import { login, register, type AuthUser } from "../lib/auth";

/**
 * Sign-in / register surface for unauthenticated visitors.
 *
 * Register form accepts any company name. The backend will find an
 * existing company (case-insensitive) or create a new one automatically.
 */

type Tab = "signin" | "register";

interface Props {
  onSignedIn: (user: AuthUser) => void;
}

export function AuthView({ onSignedIn }: Props) {
  const [tab, setTab] = useState<Tab>("signin");

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/tigress-logo.png" alt="" className="auth-logo" />
          <div className="wordmark">Tigress Financial Partners</div>
          <span className="pill">World Cup 2026</span>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={tab === "signin" ? "active" : ""}
            onClick={() => setTab("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={tab === "register" ? "active" : ""}
            onClick={() => setTab("register")}
          >
            Register
          </button>
        </div>

        {tab === "signin" ? (
          <SignInForm onSignedIn={onSignedIn} />
        ) : (
          <RegisterForm onSignedIn={onSignedIn} />
        )}
      </div>
    </div>
  );
}

// ---------- Sign in ----------

function SignInForm({ onSignedIn }: { onSignedIn: (u: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      onSignedIn(u);
    } catch (err) {
      setError((err as ApiError).message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label className="auth-field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label className="auth-field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

// ---------- Register ----------

function RegisterForm({ onSignedIn }: { onSignedIn: (u: AuthUser) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const companyName = company.trim();
    if (!companyName) {
      setError("Enter your company.");
      return;
    }
    setBusy(true);
    try {
      const u = await register(name.trim(), email.trim(), password, companyName);
      onSignedIn(u);
    } catch (err) {
      setError((err as ApiError).message || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label className="auth-field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
      </label>
      <label className="auth-field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label className="auth-field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label className="auth-field">
        <span>Company</span>
        <input
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          autoComplete="organization"
          required
        />
      </label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" type="submit" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
