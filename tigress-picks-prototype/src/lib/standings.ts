import type { GroupLetter, Match, Team } from "../types";

export interface StandingsRow {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

/** Settled-only standings for a single group. Top two flagged via caller (index 0/1). */
export function computeGroupStandings(
  group: GroupLetter,
  teams: ReadonlyArray<Team>,
  matches: ReadonlyArray<Match>,
): StandingsRow[] {
  const groupTeams = teams.filter((t) => t.group === group);
  const rows: Record<string, StandingsRow> = {};
  for (const t of groupTeams) {
    rows[t.code] = {
      team: t,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
    };
  }

  for (const m of matches) {
    if (m.kind !== "GROUP" || m.group !== group) continue;
    if (m.status !== "SETTLED" || !m.result) continue;
    const home = rows[m.homeRef];
    const away = rows[m.awayRef];
    if (!home || !away) continue;
    home.played++; away.played++;
    home.goalsFor += m.result.home;
    home.goalsAgainst += m.result.away;
    away.goalsFor += m.result.away;
    away.goalsAgainst += m.result.home;
    if (m.result.home > m.result.away) {
      home.won++; away.lost++; home.points += 3;
    } else if (m.result.home < m.result.away) {
      away.won++; home.lost++; away.points += 3;
    } else {
      home.drawn++; away.drawn++; home.points++; away.points++;
    }
  }

  for (const code in rows) {
    rows[code].goalDiff = rows[code].goalsFor - rows[code].goalsAgainst;
  }

  return Object.values(rows).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.team.name.localeCompare(b.team.name);
  });
}
