import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMatches,
  getBracket,
  putBracket,
  isApiTeam,
  type ApiMatch,
  type ApiError,
  type GroupPredRow,
  type KnockoutPredRow,
  type PutBracketPayload,
} from "../lib/api";
import { logout } from "../lib/auth";
import {
  useBracketDerivation,
  allGroupsComplete,
  type TeamSeed,
} from "../lib/useBracketDerivation";
import { useDeadline, formatRemaining } from "../lib/useDeadline";
import { GroupPredCard } from "../components/GroupPredCard";
import { KnockoutSlotCard } from "../components/KnockoutSlotCard";

/**
 * Up-front bracket fill: groups → derived KOs → submit.
 *
 * One continuous flow. The cascade preview uses the vendored bracket
 * engine (same logic as the backend's validator) so the user sees their
 * R32/R16/QF/SF/Final matchups update in real time as they fill scores
 * and pick winners. PUT /predictions/bracket is the only write.
 */

const GROUP_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const;

const ROUNDS: Array<{ label: string; ids: number[] }> = [
  { label: "Round of 32",      ids: range(73, 88) },
  { label: "Round of 16",      ids: range(89, 96) },
  { label: "Quarter-finals",   ids: range(97, 100) },
  { label: "Semi-finals",      ids: [101, 102] },
  { label: "Third-place",      ids: [103] },
  { label: "Final",            ids: [104] },
];

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

interface Props {
  onSignOut: () => void;
}

export function BracketFillView({ onSignOut }: Props) {
  const [matches, setMatches] = useState<ApiMatch[] | null>(null);
  const [groupPreds, setGroupPreds] = useState<Map<number, GroupPredRow>>(new Map());
  const [knockoutPicks, setKnockoutPicks] = useState<Map<number, KnockoutPredRow>>(new Map());
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [lockedAt, setLockedAt] = useState<string | null>(null);
  const [lockedFromBracket, setLockedFromBracket] = useState<boolean>(false);
  // Set when a submit races past the deadline and the server returns 403.
  // Combined with the deadline-hook's !isOpen into the master `closed` flag.
  const [closedFromSubmit, setClosedFromSubmit] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<{ message: string; details?: string[] } | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Server-driven countdown. While loading we optimistically render as open.
  const dl = useDeadline();
  const closed = lockedFromBracket || closedFromSubmit || (dl.loaded && !dl.isOpen);

  // ---------- Load matches + existing bracket ----------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [matchesResp, bracketResp] = await Promise.all([getMatches(), getBracket()]);
        if (cancelled) return;
        setMatches(matchesResp.matches);
        setLockedAt(bracketResp.lockedAt);
        setLockedFromBracket(bracketResp.locked);
        setSubmittedAt(bracketResp.submittedAt);
        setGroupPreds(new Map(bracketResp.groups.map((g) => [g.matchId, g])));
        setKnockoutPicks(new Map(bracketResp.knockouts.map((k) => [k.matchId, k])));
      } catch (err) {
        if (cancelled) return;
        const e = err as ApiError;
        if (e.status === 401) {
          logout();
          onSignOut();
          return;
        }
        setLoadError(e.message || "Failed to load bracket");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [onSignOut]);

  // ---------- Team seed list for the cascade engine ----------
  // GET /matches surfaces each team's REAL FIFA seed on every resolved
  // side, so the prototype's cascade preview uses the same tiebreaker
  // value the backend uses on submit. A close group that depends on the
  // seed-fallback step in the standings cascade now previews identically
  // to what the server computes — no more rejected-for-seed-mismatch.
  const teamSeed = useMemo<TeamSeed[]>(() => {
    if (!matches) return [];
    const seen = new Map<string, TeamSeed>();
    for (const m of matches) {
      if (m.type !== "group" || !m.group) continue;
      for (const side of [m.home, m.away]) {
        if (!isApiTeam(side)) continue;
        if (seen.has(side.id)) continue;
        seen.set(side.id, {
          id: side.id, name: side.name, fifa_code: side.fifa_code,
          group: m.group, seed: side.seed,
        });
      }
    }
    return [...seen.values()];
  }, [matches]);

  const derivation = useBracketDerivation({
    matches: matches ?? [],
    teams: teamSeed,
    groupPreds,
    knockoutPicks,
  });

  const groupsDone = useMemo(
    () => allGroupsComplete(derivation.groupMatches, groupPreds),
    [derivation.groupMatches, groupPreds],
  );

  // ---------- Handlers ----------
  const onGroupChange = useCallback(
    (matchId: number, side: "home" | "away", value: number | null) => {
      setGroupPreds((prev) => {
        const next = new Map(prev);
        const existing = next.get(matchId) ?? { matchId, homeScorePred: null, awayScorePred: null };
        next.set(matchId, {
          ...existing,
          [side === "home" ? "homeScorePred" : "awayScorePred"]: value,
        });
        return next;
      });
      setSubmitSuccess(null);
      setSubmitError(null);
    },
    [],
  );

  const onKoChange = useCallback(
    (
      matchId: number,
      update: Partial<{
        homeScorePred: number | null;
        awayScorePred: number | null;
        winnerPickTeamId: string | null;
      }>,
    ) => {
      setKnockoutPicks((prev) => {
        const next = new Map(prev);
        const existing = next.get(matchId) ?? {
          matchId, homeScorePred: null, awayScorePred: null,
          winnerPickTeamId: null, predHomeTeamId: null, predAwayTeamId: null,
        };
        next.set(matchId, { ...existing, ...update });
        return next;
      });
      setSubmitSuccess(null);
      setSubmitError(null);
    },
    [],
  );

  // ---------- Client-side completeness check (mirror backend rules) ----------
  const readiness = useMemo(() => {
    if (!matches) return { ready: false, missing: ["loading"] };
    const missing: string[] = [];
    for (const m of derivation.groupMatches) {
      const p = groupPreds.get(m.id);
      if (!p || p.homeScorePred == null || p.awayScorePred == null) {
        missing.push(`Group match #${m.id}`);
      }
    }
    if (!groupsDone) {
      return { ready: false, missing };
    }
    for (let id = 73; id <= 104; id++) {
      const slot = derivation.bracket.get(id);
      const pick = knockoutPicks.get(id);
      if (!slot?.home || !slot.away) {
        missing.push(`KO slot M${id} (matchup not yet derived — finish earlier picks)`);
        continue;
      }
      if (!pick || pick.homeScorePred == null || pick.awayScorePred == null) {
        missing.push(`KO slot M${id} score`);
      }
      if (!pick?.winnerPickTeamId) {
        missing.push(`KO slot M${id} winner pick`);
      }
    }
    return { ready: missing.length === 0, missing };
  }, [matches, derivation, groupPreds, knockoutPicks, groupsDone]);

  // ---------- Submit ----------
  const onSubmit = useCallback(async () => {
    if (!readiness.ready) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    const payload: PutBracketPayload = {
      groups: [...groupPreds.values()]
        .filter((g) => g.homeScorePred != null && g.awayScorePred != null)
        .map((g) => ({
          matchId: g.matchId,
          homeScorePred: g.homeScorePred as number,
          awayScorePred: g.awayScorePred as number,
        })),
      knockouts: [...knockoutPicks.values()]
        .filter((k) => k.winnerPickTeamId && k.homeScorePred != null && k.awayScorePred != null)
        .map((k) => ({
          matchId: k.matchId,
          homeScorePred: k.homeScorePred as number,
          awayScorePred: k.awayScorePred as number,
          winnerPickTeamId: k.winnerPickTeamId as string,
        })),
    };
    try {
      const resp = await putBracket(payload);
      setSubmittedAt(resp.submittedAt);
      setLockedAt(resp.lockedAt);
      setSubmitSuccess(
        `Saved. You can edit and resubmit until ${formatLockTime(resp.lockedAt)} — your latest submission is the one that counts.`,
      );
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        logout();
        onSignOut();
        return;
      }
      // Race past the deadline: server returns 403 {error:"Submissions closed", deadline}.
      // Flip the local view to closed instead of surfacing as a generic error.
      if (e.status === 403) {
        setClosedFromSubmit(true);
        setSubmitError(null);
      } else {
        setSubmitError({
          message: e.message || "Submission failed",
          details: e.details,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [readiness.ready, groupPreds, knockoutPicks, onSignOut]);

  // ---------- Render ----------
  if (loading) {
    return <FullPageStatus>Loading your bracket…</FullPageStatus>;
  }
  if (loadError) {
    return (
      <FullPageStatus>
        <div className="auth-error" style={{ maxWidth: 420 }}>{loadError}</div>
      </FullPageStatus>
    );
  }

  const readOnly = closed;

  return (
    <div className="bracket-fill">
      <DeadlineBanner
        closed={closed}
        lockedAt={lockedAt}
        submittedAt={submittedAt}
        msRemaining={dl.msRemaining}
        dlLoaded={dl.loaded}
      />

      <section>
        <h2 className="section-title">Group stage</h2>
        <div className="grp-grid">
          {GROUP_LETTERS.map((g) => {
            const matchesInGroup = derivation.groupMatches.filter((m) => m.group === g);
            const standing = derivation.standingsByGroup.get(g) ?? [];
            return (
              <GroupPredCard
                key={g}
                groupLetter={g}
                matches={matchesInGroup}
                preds={groupPreds}
                standing={standing}
                teamById={derivation.teamById}
                readOnly={readOnly}
                onChange={onGroupChange}
              />
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="section-title">Knockout bracket</h2>
        {!groupsDone && (
          <div className="ko-gate">
            Fill in every group score above to derive your knockout matchups.
          </div>
        )}
        {ROUNDS.map((round) => (
          <div key={round.label} className="ko-round-block">
            <h3 className="ko-round-label">{round.label}</h3>
            <div className="ko-round-grid">
              {round.ids.map((id) => (
                <KnockoutSlotCard
                  key={id}
                  matchId={id}
                  roundLabel={round.label}
                  slot={derivation.bracket.get(id)}
                  pick={knockoutPicks.get(id)}
                  teamById={derivation.teamById}
                  readOnly={readOnly}
                  onChange={onKoChange}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <SubmitBar
        closed={closed}
        ready={readiness.ready}
        missingCount={readiness.missing.length}
        submitting={submitting}
        onSubmit={onSubmit}
        submitError={submitError}
        submitSuccess={submitSuccess}
      />
    </div>
  );
}

// ---------- Smaller bits ----------

function DeadlineBanner({
  closed, lockedAt, submittedAt, msRemaining, dlLoaded,
}: {
  closed: boolean;
  lockedAt: string | null;
  submittedAt: string | null;
  msRemaining: number;
  dlLoaded: boolean;
}) {
  if (closed) {
    return (
      <div className="deadline-banner deadline-banner--locked">
        Submissions closed.{" "}
        {submittedAt
          ? <>Your submission from {formatLockTime(submittedAt)} is shown below, read-only — your latest submission before the deadline is the one that counts.</>
          : <>You did not submit a bracket before the deadline.</>}
      </div>
    );
  }
  // Open. Show helper copy + live countdown (offset-driven, ticks every 1s).
  return (
    <div className="deadline-banner">
      You can edit and resubmit until{" "}
      <strong>{lockedAt ? formatLockTime(lockedAt) : "June 10, 11:59 PM ET"}</strong>.
      Your latest submission is the one that counts.
      {dlLoaded && Number.isFinite(msRemaining) && (
        <> {" · "}<span className="num">{formatRemaining(msRemaining)}</span> remaining.</>
      )}
      {submittedAt && <> Last saved {formatLockTime(submittedAt)}.</>}
    </div>
  );
}

function SubmitBar({
  closed, ready, missingCount, submitting, onSubmit, submitError, submitSuccess,
}: {
  closed: boolean;
  ready: boolean;
  missingCount: number;
  submitting: boolean;
  onSubmit: () => void;
  submitError: { message: string; details?: string[] } | null;
  submitSuccess: string | null;
}) {
  if (closed) {
    return (
      <div className="submit-bar">
        <div className="submit-state">Submissions closed.</div>
        <button className="btn-submit submit-btn" type="button" disabled>
          Submissions closed
        </button>
      </div>
    );
  }
  return (
    <div className="submit-bar">
      <div className="submit-state">
        {ready
          ? "Ready to submit. Your latest submission is the one that counts."
          : `${missingCount} item${missingCount === 1 ? "" : "s"} left.`}
      </div>
      {submitError && (
        <div className="submit-error" role="alert">
          <strong>{submitError.message}</strong>
          {submitError.details && submitError.details.length > 0 && (
            <ul>
              {submitError.details.slice(0, 6).map((d, i) => <li key={i}>{d}</li>)}
              {submitError.details.length > 6 && (
                <li>… and {submitError.details.length - 6} more</li>
              )}
            </ul>
          )}
        </div>
      )}
      {submitSuccess && (
        <div className="submit-success" role="status">{submitSuccess}</div>
      )}
      <button
        className="btn-submit submit-btn"
        type="button"
        disabled={!ready || submitting}
        onClick={onSubmit}
      >
        {submitting ? "Submitting…" : "Submit bracket"}
      </button>
    </div>
  );
}

function FullPageStatus({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>
      {children}
    </div>
  );
}

function formatLockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
