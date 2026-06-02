export interface LeaderboardRow {
  userId: string;
  name: string;
  company?: string;
  points: number;
  exact: number;
  winner: number;
}

interface Props {
  title: string;
  rows: LeaderboardRow[];
  currentUserId: string;
  /** Show "via Company" in the subline (used on the overall board). */
  showCompany: boolean;
}

export function Leaderboard({ title, rows, currentUserId, showCompany }: Props) {
  return (
    <div className="lb">
      <div className="lb-header">
        <div className="lb-title">{title}</div>
        <div className="lb-count">
          {rows.length} {rows.length === 1 ? "player" : "players"}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No players yet.</div>
      ) : (
        rows.map((r, i) => {
          const isMe = r.userId === currentUserId;
          return (
            <div key={r.userId + ":" + i} className={`lb-row ${isMe ? "current" : ""}`}>
              <div className="lb-rank num">{i + 1}</div>
              <div>
                <div className="lb-name">{r.name}</div>
                <div className="lb-sub">
                  <span className="num">{r.exact}</span> exact ·{" "}
                  <span className="num">{r.winner}</span> winner
                  {showCompany && r.company && <> · {r.company}</>}
                </div>
              </div>
              <div className="lb-pts num">{r.points}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
