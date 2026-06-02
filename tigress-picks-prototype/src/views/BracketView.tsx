import type { KnockoutRound, Match } from "../types";

interface Props {
  matches: ReadonlyArray<Match>;
}

const SECTIONS: { round: KnockoutRound; label: string }[] = [
  { round: "R32",   label: "Round of 32" },
  { round: "R16",   label: "Round of 16" },
  { round: "QF",    label: "Quarter-finals" },
  { round: "SF",    label: "Semi-finals" },
  { round: "THIRD", label: "Third place" },
  { round: "FINAL", label: "Final" },
];

export function BracketView({ matches }: Props) {
  return (
    <>
      <div className="bracket-note">
        Slots auto-fill from group results. Read-only.
      </div>
      {SECTIONS.map((s) => {
        const ms = matches.filter((m) => m.kind === s.round);
        if (ms.length === 0) return null;
        return (
          <div key={s.round}>
            <div className="section-title">{s.label}</div>
            {ms.map((m) => (
              <div className="bracket-slot" key={m.id}>
                <div className="ko-label">{m.kickoff}</div>
                <div className="slot-line slot-faint">{m.homeRef}</div>
                <div className="slot-line slot-faint">{m.awayRef}</div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
