/**
 * auth (client-side)
 * ------------------
 * Thin wrappers over POST /auth/login and POST /auth/register against
 * the api-usa backend. The JWT is persisted via lib/api.setToken() so
 * subsequent apiRequest calls send it automatically.
 *
 * register() takes a companyId picked from GET /companies?q=. No invite
 * code, no free text — the AuthView typeahead resolves to a real id
 * before submit.
 */

import { apiRequest, setToken } from "./api";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await apiRequest<AuthResponse>("POST", "/auth/login", { email, password });
  setToken(res.token);
  return res.user;
}

export async function register(
  name: string,
  email: string,
  password: string,
  companyId: string,
): Promise<AuthUser> {
  const res = await apiRequest<AuthResponse>("POST", "/auth/register", {
    name,
    email,
    password,
    companyId,
  });
  setToken(res.token);
  return res.user;
}

export function logout(): void {
  setToken(null);
}
