/**
 * Leaderboard — live rows from /leaderboard/company and /leaderboard/overall.
 *
 * Renders two tables (company-scoped and overall). Before scoring kicks in
 * the rows are present but at 0 pts; the deadline banner up top tells
 * players when picks lock.
 *
 * Replaced the prior mock-data version (which expected in-memory User /
 * Match / Prediction arrays). The legacy Leaderboard component in
 * src/components/Leaderboard.tsx is no longer referenced from any mounted
 * view.
 */
import { useEffect, useState } from "react";
import {
  getLeaderboardCompany,
  getLeaderboardOverall,
  type ApiError,
  type LeaderboardRow,
} from "../lib/api";

interface Props {
  currentUserId: string;
  currentCompanyName: string;
}

export function LeaderboardView({ currentUserId, currentCompanyName }: Props) {
  const [company, setCompany] = useState<LeaderboardRow[] | null>(null);
  const [overall, setOverall] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([getLeaderboardCompany(), getLeaderboardOverall()])
      .then(([c, o]) => {
        if (cancelled) return;
        setCompany(c);
        setOverall(o);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as ApiError).message || "Failed to load leaderboard");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div className="deadline-banner">
        Submissions close <strong>June 10, 11:59 PM</strong>. Edit your bracket up to that moment — after that, scoring begins.
      </div>

      {error && <div className="auth-error" role="alert">{error}</div>}

      <div className="section-title">{currentCompanyName}</div>
      <LbTable rows={company} currentUserId={currentUserId} showCompany={false} />

      <div className="section-title">Overall</div>
      <LbTable rows={overall} currentUserId={currentUserId} showCompany={true} />
    </div>
  );
}

interface LbTableProps {
  rows: LeaderboardRow[] | null;
  currentUserId: string;
  showCompany: boolean;
}

function LbTable({ rows, currentUserId, showCompany }: LbTableProps) {
  if (rows === null) {
    return <div className="lb"><div className="empty">Loading…</div></div>;
  }
  if (rows.length === 0) {
    return <div className="lb"><div className="empty">No players yet.</div></div>;
  }
  return (
    <div className="lb">
      {rows.map((r) => {
        const isMe = r.userId === currentUserId;
        return (
          <div key={r.userId} className={isMe ? "lb-row current" : "lb-row"}>
            <div className="lb-rank">#{r.rank}</div>
            <div>
              <div className="lb-name">{r.name}</div>
              <div className="lb-sub">
                {showCompany && r.companyName ? `${r.companyName} · ` : ""}
                {r.exactCount} exact · {r.outcomeCount} correct outcomes
              </div>
            </div>
            <div className="lb-pts num">{r.points}</div>
          </div>
        );
      })}
    </div>
  );
}
