import { useMemo, useState } from "react";
import type { Filter, GroupLetter, Match, Prediction, User } from "../types";
import { FilterBar } from "../components/FilterBar";
import { MatchCard } from "../components/MatchCard";
import { GroupTable } from "../components/GroupTable";
import { teams } from "../data/teams";

interface Props {
  user: User;
  matches: ReadonlyArray<Match>;
  predictions: ReadonlyArray<Prediction>;
  onUpsertPrediction: (matchId: string, next: { home: number; away: number; locked: boolean }) => void;
}

const ROUND_LABEL: Record<string, string> = {
  R32:   "Round of 32",
  R16:   "Round of 16",
  QF:    "Quarter-finals",
  SF:    "Semi-finals",
  THIRD: "Third place",
  FINAL: "Final",
};

export function PredictView({ user, matches, predictions, onUpsertPrediction }: Props) {
  const [filter, setFilter] = useState<Filter>({ kind: "all" });

  const myPredByMatch = useMemo(() => {
    const map = new Map<string, Prediction>();
    for (const p of predictions) if (p.userId === user.id) map.set(p.matchId, p);
    return map;
  }, [predictions, user.id]);

  // True if an OPEN match currently holds the user's lock.
  const lockHolderMatchId = useMemo(() => {
    for (const m of matches) {
      if (m.status !== "OPEN") continue;
      const p = myPredByMatch.get(m.id);
      if (p?.locked) return m.id;
    }
    return null;
  }, [matches, myPredByMatch]);

  const visibleMatches: Match[] = useMemo(() => {
    if (filter.kind === "all") return [...matches];
    if (filter.kind === "group")
      return matches.filter((m) => m.kind === "GROUP" && m.group === filter.letter);
    return matches.filter((m) => m.kind === filter.round);
  }, [matches, filter]);

  const isKnockoutFilter = filter.kind === "round";
  const isGroupFilter = filter.kind === "group";

  return (
    <>
      <FilterBar active={filter} onChange={setFilter} />

      {isGroupFilter && (
        <GroupTable
          group={(filter as { kind: "group"; letter: GroupLetter }).letter}
          teams={teams}
          matches={matches}
        />
      )}

      {isKnockoutFilter && (
        <div className="bracket-note">
          {ROUND_LABEL[filter.round]} slots auto-fill from group results. Read-only here.
        </div>
      )}

      {visibleMatches.length === 0 ? (
        <div className="empty">No matches.</div>
      ) : isKnockoutFilter ? (
        visibleMatches.map((m) => (
          <div className="bracket-slot" key={m.id}>
            <div className="ko-label">
              {ROUND_LABEL[m.kind] ?? m.kind} · {m.kickoff}
            </div>
            <div className="slot-line slot-faint">{m.homeRef}</div>
            <div className="slot-line slot-faint">{m.awayRef}</div>
          </div>
        ))
      ) : (
        visibleMatches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            prediction={myPredByMatch.get(m.id)}
            lockHeldElsewhere={
              m.status === "OPEN" &&
              lockHolderMatchId !== null &&
              lockHolderMatchId !== m.id
            }
            onSubmit={(next) => onUpsertPrediction(m.id, next)}
          />
        ))
      )}
    </>
  );
}
