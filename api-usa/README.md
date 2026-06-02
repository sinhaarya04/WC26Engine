# World Cup 2026 API

REST API for the 2026 FIFA World Cup — 48 teams, 12 groups, 104 matches,
16 host stadiums across the United States, Mexico, and Canada.

> Express + MongoDB + JWT + Swagger. English-only.

## Tournament

| | |
|---|---|
| Tournament | FIFA World Cup 2026 |
| Hosts | 🇺🇸 United States, 🇲🇽 Mexico, 🇨🇦 Canada |
| Teams | 48 (expanded from 32) |
| Groups | 12 (A–L) |
| Matches | 104 (72 group stage + 32 knockout) |
| Opening match | June 11, 2026 — Mexico City |
| Final | July 19, 2026 — MetLife Stadium, East Rutherford |

## Stack

- Node.js 18+ / Express 4
- MongoDB 6+ / Mongoose
- JWT auth (bcrypt-hashed passwords)
- Swagger / OpenAPI 3.0 docs
- helmet, cors, compression, express-rate-limit, morgan

## Prerequisites

- Node.js 18.x or higher
- MongoDB 6.x running locally or hosted

## Install

```bash
git clone <your-fork-url> worldcup2026-api
cd worldcup2026-api
npm install
cp .env.example .env.development
# edit .env.development — fill MONGODB_URL, JWT_SECRET, SECRET
```

## Seed the database

Import in order — matches depend on teams.

```bash
npm run import:all
# or individually:
npm run import:groups
npm run import:teams
npm run import:stadiums
npm run import:matches
```

Data files used by the importers (already in the repo):

| File | What it is | Records |
|---|---|---|
| `football.teams.json` | 48 qualified teams | 48 |
| `football.stadiums.json` | 16 host stadiums | 16 |
| `football.matches.json` | Full fixture list incl. knockout slots | 104 |
| `football.matchtables.json` | Group standings rows | — |

## Run

```bash
npm run dev   # nodemon on :3050 with hot reload
npm run prod  # production
```

Then:
- API root → http://localhost:3050/
- Swagger UI → http://localhost:3050/api-docs/
- Health check → http://localhost:3050/health

## Auth

All `/get/*` endpoints require a Bearer JWT.

```bash
# Register
curl -X POST http://localhost:3050/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"secret"}'

# Log in
curl -X POST http://localhost:3050/auth/authenticate \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret"}'
# → { user, token }

# Use the token
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3050/get/teams
```

Tokens are valid for 84 days.

## Endpoints

### Teams
| Method | Path | Description |
|---|---|---|
| GET | `/get/teams` | All 48 teams. Filter with `?group=A`. |
| GET | `/get/team/:id` | One team by Mongo `_id`. |
| GET | `/get/team?name=Brazil` | One team by English name. |

### Groups
| Method | Path | Description |
|---|---|---|
| GET | `/get/groups` | All 12 groups. |
| GET | `/get/group?name=A` | One group + its teams. |

### Matches
| Method | Path | Description |
|---|---|---|
| GET | `/get/games` | All 104 matches with team names joined. |
| GET | `/get/game/:id` | One match. |

### Stadiums
| Method | Path | Description |
|---|---|---|
| GET | `/get/stadiums` | All 16 host venues. |
| GET | `/get/stadium/:id` | One venue. |

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | DB + server status. |
| GET | `/api/health` | none | Alias. |

## Match types

The `type` field on a match identifies its stage. Knockout matches reference
their opponents via `home_team_label` / `away_team_label` placeholders
(e.g. `"Winner Group A"`, `"3rd Group C/D/F/G/H"`, `"Winner Match 73"`)
until the result is known.

| `type` | Stage | IDs |
|---|---|---|
| `group` | Group stage | 1–72 |
| `r32`   | Round of 32 | 73–88 |
| `r16`   | Round of 16 | 89–96 |
| `qf`    | Quarter-finals | 97–100 |
| `sf`    | Semi-finals | 101–102 |
| `third` | Third-place playoff | 103 |
| `final` | Final | 104 |

## Response codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 400 | Bad request / validation error |
| 401 | Missing or invalid JWT |
| 404 | Not found |
| 429 | Rate-limited |
| 500 | Server error |

## License

ISC. See `LICENSE`.
