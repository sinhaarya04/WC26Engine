// June 10, 2026 11:59 PM ET = June 11 03:59 UTC.
// Single source of truth for the bracket lock. Every deadline check anywhere
// in the codebase must import this constant. Do not hardcode the date elsewhere.
export const SUBMISSION_DEADLINE_UTC = new Date("2026-06-11T03:59:00.000Z");
