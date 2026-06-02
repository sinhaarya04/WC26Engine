import { useEffect, useState } from "react";
import type { Match, Prediction } from "../types";
import { teamByCode } from "../data/teams";
import { ScoreInput } from "./ScoreInput";
import { LockToggle } from "./LockToggle";
import { scorePrediction } from "../lib/scoring";

interface Draft {
  home: number | "";
  away: number | "";
  locked: boolean;
}

interface Props {
  match: Match;
  /** Current user's existing prediction for this match (if any). */
  prediction?: Prediction;
  /** True if another open match holds the lock — disables toggling on here. */
  lockHeldElsewhere: boolean;
  onSubmit: (next: { home: number; away: number; locked: boolean }) => void;
}

function refLabel(ref: string): { flag: string; name: string } {
  const t = teamByCode.get(ref);
  if (t) return { flag: t.flag, name: t.name };
  return { flag: "", name: ref };
}

export function MatchCard({ match, prediction, lockHeldElsewhere, onSubmit }: Props) {
  const settled = match.status === "SETTLED" && !!match.result;

  // Editable draft state for open matches.
  const [draft, setDraft] = useState<Draft>({
    home: prediction?.home ?? "",
    away: prediction?.away ?? "",
    locked: !!prediction?.locked,
  });

  // Re-sync if the upstream prediction changes (e.g. lock cleared by another card).
  useEffect(() => {
    setDraft({
      home: prediction?.home ?? "",
      away: prediction?.away ?? "",
      locked: !!prediction?.locked,
    });
  }, [prediction?.home, prediction?.away, prediction?.locked]);

  const home = refLabel(match.homeRef);
  const away = refLabel(match.awayRef);

  const submittable =
    !settled &&
    draft.home !== "" &&
    draft.away !== "" &&
    Number.isFinite(draft.home as number) &&
    Number.isFinite(draft.away as number);

  const groupLabel =
    match.kind === "GROUP"
      ? `Group ${match.group} · MD${match.matchday}`
      : match.kind === "FINAL"
        ? "Final"
        : match.kind;

  let breakdown: ReturnType<typeof scorePrediction> | null = null;
  if (settled && prediction && match.result) {
    breakdown = scorePrediction(prediction, match.result);
  }

  return (
    <div className={`card ${draft.locked && !settled ? "has-lock" : ""}`}>
      <div className="card-top">
        <span className="group-label">{groupLabel}</span>
        {settled ? (
          <span className="status-settled">Final</span>
        ) : (
          <span>{match.kickoff}</span>
        )}
      </div>

      <div className="team-row">
        <div className="team-left">
          {home.flag && <span className="team-flag">{home.flag}</span>}
          <span>{home.name}</span>
        </div>
        <div className="team-right">
          {settled ? (
            <span className="score-display num">{match.result!.home}</span>
          ) : (
            <ScoreInput
              value={draft.home}
              ariaLabel={`${home.name} score`}
              onChange={(v) => setDraft((d) => ({ ...d, home: v }))}
            />
          )}
        </div>
      </div>

      <div className="team-row">
        <div className="team-left">
          {away.flag && <span className="team-flag">{away.flag}</span>}
          <span>{away.name}</span>
        </div>
        <div className="team-right">
          {settled ? (
            <span className="score-display num">{match.result!.away}</span>
          ) : (
            <ScoreInput
              value={draft.away}
              ariaLabel={`${away.name} score`}
              onChange={(v) => setDraft((d) => ({ ...d, away: v }))}
            />
          )}
        </div>
      </div>

      {settled ? (
        <div className="card-actions">
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {prediction ? (
              <>
                Your pick:{" "}
                <span className="num">
                  {prediction.home}–{prediction.away}
                </span>
                {prediction.locked && <span className="lock-badge">2× Lock</span>}
              </>
            ) : (
              "No prediction"
            )}
          </div>
          <span className={`points-pill ${breakdown && breakdown.total === 0 ? "zero" : ""}`}>
            {breakdown ? `+${breakdown.total}` : "0"} pts
          </span>
        </div>
      ) : (
        <div className="card-actions">
          <LockToggle
            locked={draft.locked}
            disabled={lockHeldElsewhere && !draft.locked}
            onToggle={() => setDraft((d) => ({ ...d, locked: !d.locked }))}
          />
          <button
            className="btn-submit"
            disabled={!submittable}
            onClick={() =>
              onSubmit({
                home: draft.home as number,
                away: draft.away as number,
                locked: draft.locked,
              })
            }
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
