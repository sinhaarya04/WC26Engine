export type TabId = "rules" | "predict" | "leaderboard";

interface Props {
  active: TabId;
  onChange: (next: TabId) => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "rules",       label: "Rules" },
  { id: "predict",     label: "Predict" },
  { id: "leaderboard", label: "Leaderboard" },
];

export function Tabs({ active, onChange }: Props) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={active === t.id ? "active" : ""}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
