/**
 * api client (Vite)
 * -----------------
 * Thin fetch wrapper around the api-usa backend. Base URL comes from
 * import.meta.env.VITE_API_BASE_URL (set in tigress-picks-prototype/.env
 * or .env.local). Token is stored in localStorage and re-sent on every
 * request that has one.
 *
 * Only the endpoints needed by the auth flow live here today —
 * apiRequest is generic so other resources can layer on as the prototype
 * grows past mock data.
 */

export interface ApiError extends Error {
  status: number;
  /** Set when the backend returns { error, details: string[] } (e.g. the
   *  bracket validator's per-slot complaints). */
  details?: string[];
}

// In dev the fallback matches api-usa's default PORT (3050). Override in
// tigress-picks-prototype/.env.local with VITE_API_BASE_URL=http://localhost:<port>
// for a non-standard backend port.
//
// In a production build, VITE_API_BASE_URL is REQUIRED — no silent default
// can leak a localhost URL into a deployed bundle. Vite substitutes
// import.meta.env values at build time, so this check fires at module load
// in any prod build where the env var was missing during `npm run build`.
const ENV_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (import.meta.env.PROD && !ENV_BASE_URL) {
  throw new Error(
    "VITE_API_BASE_URL is required for production builds. Set it in your hosting platform " +
      "(Vercel → Project Settings → Environment Variables) before building.",
  );
}
const BASE_URL = (ENV_BASE_URL ?? "http://localhost:3050").replace(/\/+$/, "");

const TOKEN_KEY = "tigress.picks.token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode etc. */
  }
}

export async function apiRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const obj = (parsed && typeof parsed === "object" && parsed !== null)
      ? (parsed as { error?: unknown; details?: unknown })
      : null;
    const message =
      (obj && obj.error != null ? String(obj.error) : null) ||
      res.statusText ||
      `Request failed: ${res.status}`;
    const err = new Error(message) as ApiError;
    err.status = res.status;
    if (obj && Array.isArray(obj.details)) {
      err.details = obj.details.filter((d): d is string => typeof d === "string");
    }
    throw err;
  }

  return parsed as T;
}

// ---------- /companies ----------

export interface CompanyOption {
  id: string;
  name: string;
}

/**
 * GET /companies?q=<search>. Public; powers the registration page
 * typeahead. Case-insensitive partial match server-side.
 */
export function searchCompanies(q: string): Promise<CompanyOption[]> {
  const path = q ? `/companies?q=${encodeURIComponent(q)}` : "/companies";
  return apiRequest<CompanyOption[]>("GET", path);
}

// ---------- /deadline ----------

export interface DeadlineResponse {
  /** ISO-8601, the moment submissions close (inclusive on the closed side). */
  deadline: string;
  /** ISO-8601, server's current time at the moment of the response. */
  serverNow: string;
  /** True iff serverNow < deadline (matches backend's strict-less check). */
  isOpen: boolean;
}

/**
 * GET /deadline — public, no auth. Used by the countdown to compute a
 * client/server clock offset once at load and then tick locally off that
 * offset. Never trust the raw browser clock for open/closed state.
 */
export function getDeadline(): Promise<DeadlineResponse> {
  return apiRequest<DeadlineResponse>("GET", "/deadline");
}

// ---------- /matches ----------

export interface ApiTeamSummary {
  id: string;
  name: string;
  fifa_code: string;
  /**
   * FIFA seed (lower wins ties). Backend exposes this on every resolved
   * team side via GET /matches so the prototype's cascade preview uses the
   * same tiebreaker the backend uses on submit.
   */
  seed: number;
}

export interface ApiMatchResult {
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
}

export interface ApiMatch {
  id: number;
  type: "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";
  group: string | null;
  matchday: number | null;
  kickoffUtc: string;
  status: "finished" | "scheduled";
  home: ApiTeamSummary | { label: string | null };
  away: ApiTeamSummary | { label: string | null };
  result: ApiMatchResult | null;
}

export function getMatches(): Promise<{ matches: ApiMatch[] }> {
  return apiRequest<{ matches: ApiMatch[] }>("GET", "/matches");
}

/** Narrowing helper — a placeholder side has only `label`, a real team has `id`. */
export function isApiTeam(side: ApiMatch["home"]): side is ApiTeamSummary {
  return typeof (side as ApiTeamSummary).id === "string";
}

// ---------- /predictions/bracket ----------

export interface GroupPredRow {
  matchId: number;
  homeScorePred: number | null;
  awayScorePred: number | null;
}

export interface KnockoutPredRow {
  matchId: number;
  homeScorePred: number | null;
  awayScorePred: number | null;
  winnerPickTeamId: string | null;
  predHomeTeamId: string | null;
  predAwayTeamId: string | null;
}

export interface GetBracketResponse {
  groups: GroupPredRow[];
  knockouts: KnockoutPredRow[];
  submittedAt: string | null;
  lockedAt: string | null;
  locked: boolean;
}

export function getBracket(): Promise<GetBracketResponse> {
  return apiRequest<GetBracketResponse>("GET", "/predictions/bracket");
}

export interface PutBracketPayload {
  groups: Array<{ matchId: number; homeScorePred: number; awayScorePred: number }>;
  knockouts: Array<{
    matchId: number;
    homeScorePred: number;
    awayScorePred: number;
    winnerPickTeamId: string;
  }>;
}

export interface PutBracketResponse {
  submittedAt: string;
  groups: number;
  knockouts: number;
  lockedAt: string;
}

export function putBracket(payload: PutBracketPayload): Promise<PutBracketResponse> {
  return apiRequest<PutBracketResponse>("PUT", "/predictions/bracket", payload);
}

// ---------- /leaderboard ----------

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  points: number;
  exactCount: number;
  outcomeCount: number;
  /** Present only on /leaderboard/overall (cross-company). */
  companyName?: string;
}

// Backend wraps both endpoints in { leaderboard: [...] } (see
// api-usa/src/controllers/leaderboard.controller.ts).
export async function getLeaderboardCompany(): Promise<LeaderboardRow[]> {
  const res = await apiRequest<{ leaderboard: LeaderboardRow[] }>("GET", "/leaderboard/company");
  return res.leaderboard;
}

export async function getLeaderboardOverall(): Promise<LeaderboardRow[]> {
  const res = await apiRequest<{ leaderboard: LeaderboardRow[] }>("GET", "/leaderboard/overall");
  return res.leaderboard;
}
