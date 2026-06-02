import { useCallback, useState } from "react";
import { AuthView } from "./views/AuthView";
import { BracketFillView } from "./views/BracketFillView";
import { RulesView } from "./views/RulesView";
import { LeaderboardView } from "./views/LeaderboardView";
import { Tabs, type TabId } from "./components/Tabs";
import { logout, type AuthUser } from "./lib/auth";
import { useDeadline, formatRemaining } from "./lib/useDeadline";

/**
 * Auth gate + three-tab shell over the up-front bracket prediction flow.
 *
 *   Rules       — scoring / submission rules
 *   Predict     — BracketFillView (group scores + KO picks, single PUT)
 *   Leaderboard — live /leaderboard/company and /leaderboard/overall rows
 *
 * Header shows the Tigress Financial Partners logo + wordmark; the
 * underlying view is selected by `tab` and persisted only in component
 * state (no router yet).
 */
export function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [tab, setTab] = useState<TabId>("rules");

  const onSignOut = useCallback(() => {
    logout();
    setAuthUser(null);
  }, []);

  if (!authUser) {
    return <AuthView onSignedIn={setAuthUser} />;
  }

  return (
    <div className="page">
      <SlimHeader user={authUser} onSignOut={onSignOut} />
      <Tabs active={tab} onChange={setTab} />
      {tab === "rules" && <RulesView />}
      {tab === "predict" && <BracketFillView onSignOut={onSignOut} />}
      {tab === "leaderboard" && (
        <LeaderboardView
          currentUserId={authUser.id}
          currentCompanyName={authUser.companyName}
        />
      )}
    </div>
  );
}

function SlimHeader({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const dl = useDeadline();
  const countdownLabel = !dl.loaded
    ? "Loading deadline…"
    : dl.error
      ? "Deadline unavailable"
      : dl.isOpen
        ? `Submissions close in ${formatRemaining(dl.msRemaining)}`
        : "Submissions closed";

  return (
    <header className="header">
      <div className="brand">
        <img src="/tigress-logo.png" alt="" className="brand-logo" />
        <div className="wordmark">Tigress Financial Partners</div>
        <span className={dl.loaded && !dl.isOpen ? "pill pill--closed" : "pill"}>
          {countdownLabel}
        </span>
      </div>
      <div className="user-block">
        <div className="name">{user.name}</div>
        <div className="points">
          {user.companyName}
          {" · "}
          <button
            type="button"
            onClick={onSignOut}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--muted)",
              textDecoration: "underline",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
