import type { User } from "../types";

interface Props {
  user: User;
  totalPoints: number;
}

export function Header({ user, totalPoints }: Props) {
  return (
    <header className="header">
      <div className="brand">
        <img src="/tigress-logo.png" alt="" className="brand-logo" />
        <div className="wordmark">Tigress Financial Partners</div>
        <span className="pill">World Cup 2026</span>
      </div>
      <div className="user-block">
        <div className="name">{user.name}</div>
        <div className="points">
          <strong className="num">{totalPoints}</strong> pts
        </div>
      </div>
    </header>
  );
}
