import type { User } from "../types";

/**
 * Mock users. 6 across 3 companies (2 per company). Two users named
 * "Aryan Sinha" by intent — one at Acme (the current user), one at Initech.
 */
export const users: ReadonlyArray<User> = [
  { id: "u1", name: "Aryan Sinha",      company: "Acme Corp", companyId: "acme" },
  { id: "u2", name: "Nina Caldarone",   company: "Acme Corp", companyId: "acme" },
  { id: "u3", name: "Alex Lesko",       company: "Globex",    companyId: "globex" },
  { id: "u4", name: "Richi Urquidi",    company: "Globex",    companyId: "globex" },
  { id: "u5", name: "Michael Lindley",  company: "Initech",   companyId: "initech" },
  { id: "u6", name: "Aryan Sinha",      company: "Initech",   companyId: "initech" },
];

/** Mock authenticated user. */
export const currentUser: User = users[0];
