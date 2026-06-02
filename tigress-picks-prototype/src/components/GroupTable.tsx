import type { GroupLetter, Match, Team } from "../types";
import { computeGroupStandings } from "../lib/standings";

interface Props {
  group: GroupLetter;
  teams: ReadonlyArray<Team>;
  matches: ReadonlyArray<Match>;
}

export function GroupTable({ group, teams, matches }: Props) {
  const rows = computeGroupStandings(group, teams, matches);
  return (
    <div className="standings">
      <table>
        <thead>
          <tr>
            <th>Group {group}</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.team.code} className={i < 2 ? "qualified" : ""}>
              <td className="team-name">
                <span className="team-flag">{r.team.flag}</span>
                {r.team.name}
              </td>
              <td>{r.played}</td>
              <td>{r.won}</td>
              <td>{r.drawn}</td>
              <td>{r.lost}</td>
              <td>{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
              <td><strong>{r.points}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
