/**
 * Integration tests for GET /matches.
 *
 * Mocks Match + Team models (same pattern as bracket.controller.test.ts).
 * Covers:
 *   - team {id,name,fifa_code} resolved on each side when teamId is set
 *   - falls back to homeLabel/awayLabel for placeholder KO slots
 *   - status="finished" + result populated only when match.finished
 *   - kickoff serialized as ISO-8601
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/Match", () => ({
  Match: { find: vi.fn() },
}));
vi.mock("../models/team", () => ({
  Team: { find: vi.fn() },
}));

import { Match } from "../models/Match";
import { Team } from "../models/team";
import { listMatches } from "./matches.controller";

// ---------- Mongoose chain mock ----------

function mockFindChain<T>(rows: T) {
  return {
    sort: () => ({ lean: () => Promise.resolve(rows) }),
    lean: () => Promise.resolve(rows),
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(p: unknown) { this.body = p; return this; },
  };
}

// ---------- Fixtures ----------

const TEAMS = [
  { id: "USA", name: "United States", fifa_code: "USA", seed: 13 },
  { id: "MEX", name: "Mexico",        fifa_code: "MEX", seed: 14 },
  { id: "BRA", name: "Brazil",        fifa_code: "BRA", seed: 5  },
];

const MATCHES = [
  // Finished group match
  {
    id: 1, type: "group", group: "A", matchday: 1,
    homeTeamId: "USA", awayTeamId: "MEX",
    homeLabel: null, awayLabel: null,
    kickoffUtc: new Date("2026-06-11T20:00:00Z"),
    finished: true, homeScore: 2, awayScore: 1, winnerTeamId: null,
  },
  // Scheduled group match
  {
    id: 2, type: "group", group: "A", matchday: 2,
    homeTeamId: "BRA", awayTeamId: "USA",
    homeLabel: null, awayLabel: null,
    kickoffUtc: new Date("2026-06-15T22:00:00Z"),
    finished: false, homeScore: null, awayScore: null, winnerTeamId: null,
  },
  // KO slot with unresolved feeders → labels only
  {
    id: 73, type: "r32", group: undefined, matchday: 8,
    homeTeamId: undefined, awayTeamId: undefined,
    homeLabel: "Winner Group A", awayLabel: "Runner-up Group B",
    kickoffUtc: new Date("2026-06-29T16:00:00Z"),
    finished: false, homeScore: null, awayScore: null, winnerTeamId: null,
  },
];

beforeEach(() => {
  vi.mocked(Match.find).mockReset();
  vi.mocked(Team.find).mockReset();
  vi.mocked(Match.find).mockReturnValue(mockFindChain(MATCHES) as never);
  vi.mocked(Team.find).mockReturnValue(mockFindChain(TEAMS) as never);
});

describe("GET /matches", () => {
  it("returns all matches with team summaries resolved", async () => {
    const res = makeRes();
    await listMatches({} as never, res as never);

    expect(res.statusCode).toBe(200);
    const body = res.body as { matches: Array<Record<string, unknown>> };
    expect(body.matches).toHaveLength(3);

    const m1 = body.matches.find((m) => m.id === 1)!;
    expect(m1.home).toEqual({ id: "USA", name: "United States", fifa_code: "USA", seed: 13 });
    expect(m1.away).toEqual({ id: "MEX", name: "Mexico", fifa_code: "MEX", seed: 14 });
    expect(m1.status).toBe("finished");
    expect(m1.result).toEqual({ homeScore: 2, awayScore: 1, winnerTeamId: null });
    expect(m1.kickoffUtc).toBe("2026-06-11T20:00:00.000Z");
  });

  it("includes the team's FIFA seed on every resolved side so the frontend cascade preview matches the backend's tiebreaker", async () => {
    // Regression guard for the Stage 3 mismatch where the prototype had to
    // synthesise seeds and could disagree with the backend in seed-tied
    // groups. Seed must travel with every resolved team summary.
    const res = makeRes();
    await listMatches({} as never, res as never);

    const matches = (res.body as { matches: Array<Record<string, unknown>> }).matches;
    for (const m of matches) {
      for (const side of [m.home, m.away]) {
        if (side && typeof (side as { id?: unknown }).id === "string") {
          const s = side as { id: string; seed: unknown };
          expect(typeof s.seed, `team ${s.id} on match ${m.id}`).toBe("number");
        }
      }
    }
    // Sanity: BRA has the lowest seed in the fixture (5) and should win
    // any seed-tied scenario between USA(13) and BRA(5).
    const m2 = matches.find((m) => m.id === 2)!;
    const home = m2.home as { id: string; seed: number };
    const away = m2.away as { id: string; seed: number };
    expect(home.seed).toBe(5);   // BRA
    expect(away.seed).toBe(13);  // USA
  });

  it("scheduled match has status=scheduled and result=null", async () => {
    const res = makeRes();
    await listMatches({} as never, res as never);

    const m2 = (res.body as { matches: Array<Record<string, unknown>> }).matches.find(
      (m) => m.id === 2,
    )!;
    expect(m2.status).toBe("scheduled");
    expect(m2.result).toBeNull();
  });

  it("falls back to {label} when teamId is not yet resolved", async () => {
    const res = makeRes();
    await listMatches({} as never, res as never);

    const m73 = (res.body as { matches: Array<Record<string, unknown>> }).matches.find(
      (m) => m.id === 73,
    )!;
    expect(m73.home).toEqual({ label: "Winner Group A" });
    expect(m73.away).toEqual({ label: "Runner-up Group B" });
  });
});
