import type { ApiTeamSummary, KnockoutPredRow } from "../lib/api";
import type { BracketSlot } from "../lib/bracketEngine/types";
import { flagFor } from "../lib/flags";

interface Props {
  matchId: number;
  roundLabel: string;
  slot: BracketSlot | undefined;
  pick: KnockoutPredRow | undefined;
  teamById: Map<string, ApiTeamSummary>;
  readOnly: boolean;
  onChange: (
    matchId: number,
    update: Partial<{ homeScorePred: number | null; awayScorePred: number | null; winnerPickTeamId: string | null }>,
  ) => void;
}

export function KnockoutSlotCard({
  matchId, roundLabel, slot, pick, teamById, readOnly, onChange,
}: Props) {
  const home = slot?.home;
  const away = slot?.away;
  // Defensive fallback only — teamById is populated from the same /matches
  // response that drives the engine, so a miss means a data-loading race.
  // Render the id rather than crash; seed is irrelevant here (this component
  // doesn't run the engine).
  const homeTeam = home ? (teamById.get(home.id) ?? { id: home.id, name: home.id, fifa_code: "", seed: home.seed }) : null;
  const awayTeam = away ? (teamById.get(away.id) ?? { id: away.id, name: away.id, fifa_code: "", seed: away.seed }) : null;

  const resolved = Boolean(home && away);
  const selectedWinner = pick?.winnerPickTeamId ?? null;

  return (
    <div className={`ko-card${!resolved ? " ko-card--pending" : ""}${selectedWinner ? " ko-card--picked" : ""}`}>
      <div className="ko-card-head">
        <span className="ko-mid">M{matchId}</span>
        <span className="ko-round">{roundLabel}</span>
      </div>

      {!resolved && (
        <div className="ko-pending">
          Finish your earlier picks to unlock this matchup.
        </div>
      )}

      {resolved && (
        <>
          <SideRow
            team={homeTeam!}
            side="home"
            score={pick?.homeScorePred ?? null}
            selected={selectedWinner === homeTeam!.id}
            disabled={readOnly}
            onScore={(v) => onChange(matchId, { homeScorePred: v })}
            onPick={() => onChange(matchId, { winnerPickTeamId: homeTeam!.id })}
          />
          <SideRow
            team={awayTeam!}
            side="away"
            score={pick?.awayScorePred ?? null}
            selected={selectedWinner === awayTeam!.id}
            disabled={readOnly}
            onScore={(v) => onChange(matchId, { awayScorePred: v })}
            onPick={() => onChange(matchId, { winnerPickTeamId: awayTeam!.id })}
          />
          <div className="ko-hint">
            {selectedWinner
              ? null
              : "Pick the team you think advances (knockouts can't draw)."}
          </div>
        </>
      )}
    </div>
  );
}

interface SideRowProps {
  team: ApiTeamSummary;
  side: "home" | "away";
  score: number | null;
  selected: boolean;
  disabled: boolean;
  onScore: (v: number | null) => void;
  onPick: () => void;
}

function SideRow({ team, score, selected, disabled, onScore, onPick }: SideRowProps) {
  return (
    <div className={`ko-side${selected ? " ko-side--winner" : ""}`}>
      <button
        type="button"
        className={`ko-pick${selected ? " ko-pick--on" : ""}`}
        disabled={disabled}
        onClick={onPick}
        aria-pressed={selected}
        title={selected ? "Selected to advance" : "Pick to advance"}
      >
        {selected ? "✓" : ""}
      </button>
      <span className="ko-team">
        <span className="grp-flag">{flagFor(team.fifa_code)}</span>
        <span className="grp-name">{team.name}</span>
      </span>
      <input
        type="number"
        min={0}
        max={20}
        className="score-input"
        value={score == null ? "" : String(score)}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onScore(null);
          const n = Number(raw);
          if (!Number.isInteger(n) || n < 0) return;
          onScore(n);
        }}
      />
    </div>
  );
}
