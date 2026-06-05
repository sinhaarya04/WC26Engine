/**
 * auth (client-side)
 * ------------------
 * Thin wrappers over POST /auth/login and POST /auth/register against
 * the api-usa backend. The JWT is persisted via lib/api.setToken() so
 * subsequent apiRequest calls send it automatically.
 *
 * register() sends a companyName. The backend finds or creates the
 * company automatically.
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
  companyName: string,
): Promise<AuthUser> {
  const res = await apiRequest<AuthResponse>("POST", "/auth/register", {
    name,
    email,
    password,
    companyName,
  });
  setToken(res.token);
  return res.user;
}

export function logout(): void {
  setToken(null);
}
