interface Props {
  value: number | "";
  disabled?: boolean;
  ariaLabel: string;
  onChange: (v: number | "") => void;
}

export function ScoreInput({ value, disabled, ariaLabel, onChange }: Props) {
  return (
    <input
      type="number"
      min={0}
      max={20}
      inputMode="numeric"
      className="score-input"
      disabled={disabled}
      value={value === "" ? "" : value}
      aria-label={ariaLabel}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange("");
        const n = Math.max(0, Math.min(20, Number(raw)));
        onChange(Number.isFinite(n) ? n : "");
      }}
    />
  );
}
