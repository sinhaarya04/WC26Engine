interface Props {
  locked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

export function LockToggle({ locked, disabled, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`lock-toggle ${locked ? "on" : ""}`}
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={locked}
      title="Lock of the Day doubles this match's points. Only one across open matches."
    >
      <span className="dot" />
      {locked ? "Locked · 2×" : "Lock of the Day"}
    </button>
  );
}
