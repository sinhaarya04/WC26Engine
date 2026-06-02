import { useMemo } from "react";
import type { ApiMatch, ApiTeamSummary, GroupPredRow } from "../lib/api";
import { isApiTeam } from "../lib/api";
import type { RankedTeam } from "../lib/bracketEngine/types";
import { flagFor } from "../lib/flags";

interface Props {
  groupLetter: string;
  matches: ApiMatch[];
  preds: Map<number, GroupPredRow>;
  standing: RankedTeam[];
  teamById: Map<string, ApiTeamSummary>;
  readOnly: boolean;
  onChange: (matchId: number, side: "home" | "away", value: number | null) => void;
}

export function GroupPredCard({
  groupLetter, matches, preds, standing, teamById, readOnly, onChange,
}: Props) {
  const sortedMatches = useMemo(
    () => [...matches].sort((a, b) => a.id - b.id),
    [matches],
  );

  return (
    <div className="grp-card">
      <div className="grp-header">
        <span className="grp-letter">Group {groupLetter}</span>
        <span className="grp-progress">{filledCount(matches, preds)}/{matches.length}</span>
      </div>

      <div className="grp-standings">
        <div className="grp-standings-head">
          <span />
          <span>P</span><span>W</span><span>D</span><span>L</span>
          <span>GD</span><span className="bold">Pts</span>
        </div>
        {standing.map((row) => {
          const t = teamById.get(row.team.id);
          const qualified = row.rank <= 2; // top 2 advance; thirds handled cross-group
          return (
            <div key={row.team.id} className={`grp-standings-row${qualified ? " qualified" : ""}`}>
              <span className="grp-team">
                <span className="grp-flag">{flagFor(t?.fifa_code)}</span>
                <span className="grp-name">{t?.name ?? row.team.id}</span>
              </span>
              <span className="num">{row.played}</span>
              <span className="num">{row.won}</span>
              <span className="num">{row.drawn}</span>
              <span className="num">{row.lost}</span>
              <span className="num">{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</span>
              <span className="num bold">{row.points}</span>
            </div>
          );
        })}
      </div>

      <div className="grp-matches">
        {sortedMatches.map((m) => {
          const p = preds.get(m.id);
          if (!isApiTeam(m.home) || !isApiTeam(m.away)) return null;
          const home = teamById.get(m.home.id) ?? m.home;
          const away = teamById.get(m.away.id) ?? m.away;
          return (
            <div key={m.id} className="grp-match">
              <div className="grp-match-side">
                <span className="grp-flag">{flagFor(home.fifa_code)}</span>
                <span className="grp-name">{home.name}</span>
              </div>
              <div className="grp-match-scores">
                <ScoreInput
                  value={p?.homeScorePred ?? null}
                  disabled={readOnly}
                  onChange={(v) => onChange(m.id, "home", v)}
                />
                <span className="grp-vs">–</span>
                <ScoreInput
                  value={p?.awayScorePred ?? null}
                  disabled={readOnly}
                  onChange={(v) => onChange(m.id, "away", v)}
                />
              </div>
              <div className="grp-match-side grp-match-side--away">
                <span className="grp-name">{away.name}</span>
                <span className="grp-flag">{flagFor(away.fifa_code)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function filledCount(matches: ApiMatch[], preds: Map<number, GroupPredRow>): number {
  let n = 0;
  for (const m of matches) {
    const p = preds.get(m.id);
    if (p && p.homeScorePred != null && p.awayScorePred != null) n++;
  }
  return n;
}

interface ScoreInputProps {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
}

function ScoreInput({ value, onChange, disabled }: ScoreInputProps) {
  return (
    <input
      type="number"
      min={0}
      max={20}
      className="score-input"
      value={value == null ? "" : String(value)}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(null);
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) return;
        onChange(n);
      }}
    />
  );
}
