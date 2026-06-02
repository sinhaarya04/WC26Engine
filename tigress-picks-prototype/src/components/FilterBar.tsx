import type { Filter, GroupLetter, KnockoutRound } from "../types";

interface Props {
  active: Filter;
  onChange: (next: Filter) => void;
}

const GROUP_LETTERS: GroupLetter[] = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const ROUNDS: { id: KnockoutRound; label: string }[] = [
  { id: "R32",   label: "R32" },
  { id: "R16",   label: "R16" },
  { id: "QF",    label: "QF" },
  { id: "SF",    label: "SF" },
  { id: "FINAL", label: "Final" },
];

function key(f: Filter): string {
  if (f.kind === "all") return "all";
  if (f.kind === "group") return `g:${f.letter}`;
  return `r:${f.round}`;
}

export function FilterBar({ active, onChange }: Props) {
  const activeKey = key(active);
  const Chip = (label: string, filter: Filter) => (
    <button
      key={key(filter)}
      className={`chip ${activeKey === key(filter) ? "active" : ""}`}
      onClick={() => onChange(filter)}
    >
      {label}
    </button>
  );

  return (
    <div className="chips">
      {Chip("All", { kind: "all" })}
      {GROUP_LETTERS.map((l) => Chip(`Group ${l}`, { kind: "group", letter: l }))}
      {ROUNDS.map((r) => Chip(r.label, { kind: "round", round: r.id }))}
    </div>
  );
}
