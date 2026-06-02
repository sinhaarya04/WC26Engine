# Vendored bracket engine

These files are byte-identical (modulo this header note) copies of
`api-usa/src/core/`:

- types.ts
- standings.ts
- thirdPlace.ts
- thirdPlaceTable.ts
- bracketMap.ts
- resolveBracket.ts

They power the client-side cascade preview on the bracket-fill view so the
user sees instant matchup updates as they fill in group scores. The
backend remains the source of truth — `PUT /predictions/bracket` re-runs
the same logic server-side and rejects on any mismatch.

**Keep in sync.** If any of the source files in `api-usa/src/core/`
change, mirror the change here. There is no test enforcing parity yet.
