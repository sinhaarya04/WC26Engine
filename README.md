<p align="center">
  <img src="Logo.png" alt="WC26Engine" width="80" />
</p>

<h1 align="center">WC26Engine</h1>

<p align="center">
  Full-stack World Cup 2026 prediction game built for <strong>Tigress Financial Partners</strong>.<br/>
  Players predict scores for all 104 matches, fill knockout brackets, and compete on company and overall leaderboards.
</p>

<p align="center">
  <a href="https://tigress-picks.vercel.app">Live App</a> &middot;
  <a href="https://wc26-api.vercel.app/health">API Health</a>
</p>

---

## Overview

WC26Engine is a multi-tenant prediction game where employees across companies register, predict group-stage scores, fill out a complete knockout bracket, and earn points based on real match results. The app handles the full 2026 FIFA World Cup format: **48 teams, 12 groups, 104 matches** including the new Round of 32.

### Key Features

- **Full bracket prediction** — Group stage scores + knockout bracket with cascading team resolution
- **Live scoring** — Exact score, correct outcome, and correct winner points
- **Multi-tenant** — Company-scoped leaderboards + cross-company overall rankings
- **Third-place slot solver** — Backtracking algorithm assigns best 8 third-place teams to R32 slots per FIFA rules
- **Deadline enforcement** — Server-side cutoff; submissions lock automatically
- **JWT auth** — Register/login with company affiliation

---

## Architecture

```
┌──────────────────────────┐       ┌──────────────────────────┐
│   tigress-picks-prototype│       │        api-usa           │
│   (Vite + React + TS)    │──────▶│   (Express + TS + JWT)   │
│   Vercel (static)        │ REST  │   Vercel (serverless)    │
└──────────────────────────┘       └────────────┬─────────────┘
                                                │
                                        ┌───────▼───────┐
                                        │  MongoDB Atlas │
                                        │   (M0 free)   │
                                        └───────────────┘
```

| Component | Stack | Deployment |
|-----------|-------|------------|
| **Frontend** | React 18, Vite 5, TypeScript | [Vercel](https://tigress-picks.vercel.app) |
| **Backend** | Express, Mongoose, JWT, bcrypt | [Vercel](https://wc26-api.vercel.app) |
| **Database** | MongoDB Atlas (M0) | Cloud |

---

## Project Structure

```
WC26Engine/
├── api-usa/                    # Backend API
│   ├── src/
│   │   ├── config/             # Env validation, deadline config
│   │   ├── controllers/        # Route handlers + tests
│   │   ├── core/               # Bracket engine (standings, R32 feeders, third-place solver)
│   │   ├── models/             # Mongoose schemas (User, Match, Prediction, Score, Company)
│   │   ├── routes/             # Express routers
│   │   ├── services/           # Bracket validator, scoring engine, leaderboard
│   │   ├── middleware/         # JWT auth, admin guard
│   │   ├── seed/               # DB seeding scripts
│   │   └── index.ts            # App entry point
│   ├── data/matches.json       # Fixture data (seeder source)
│   └── package.json
│
├── tigress-picks-prototype/    # Frontend
│   ├── src/
│   │   ├── components/         # UI components (MatchCard, GroupTable, Leaderboard, etc.)
│   │   ├── views/              # Page views (Auth, BracketFill, Predict, Leaderboard, Rules)
│   │   ├── lib/                # API client, auth, scoring, bracket engine, hooks
│   │   │   └── bracketEngine/  # Client-side bracket resolution (cascade preview)
│   │   ├── data/               # Static match/team data for offline rendering
│   │   └── App.tsx             # Root component
│   └── package.json
│
├── matches.json                # Master fixture list (104 matches, all kickoff times)
├── teams.json                  # 48 qualified teams (seeds, pots, groups)
├── DEPLOY.md                   # Deployment guide
└── Logo.png
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register` | - | Create account with company |
| `POST` | `/auth/login` | - | Sign in, receive JWT |
| `GET` | `/matches` | - | All 104 fixtures with resolved teams and results |
| `GET` | `/companies?q=` | - | Company search (registration typeahead) |
| `GET` | `/deadline` | - | Submission deadline + server clock |
| `GET` | `/predictions/bracket` | JWT | Current user's bracket |
| `PUT` | `/predictions/bracket` | JWT | Submit/update full bracket (72 group + 32 knockout) |
| `GET` | `/leaderboard/company` | JWT | Company-scoped leaderboard |
| `GET` | `/leaderboard/overall` | JWT | Cross-company leaderboard |
| `GET` | `/health` | - | Server status + DB connection |

---

## Scoring Rules

| Category | Points | Condition |
|----------|--------|-----------|
| Exact score | **5** | Predicted score matches exactly |
| Correct outcome | **3** | Right winner (or draw) but wrong score |
| Correct winner | **1** | Right advancing team in knockout (score wrong) |

---

## Local Development

```bash
# 1. Clone
git clone https://github.com/sinhaarya04/WC26Engine.git
cd WC26Engine

# 2. Backend
cd api-usa
cp .env.example .env.development   # fill MONGODB_URL, SECRET
npm install
npm run dev                        # http://localhost:3050

# 3. Frontend (new terminal)
cd tigress-picks-prototype
cp .env.example .env.local         # VITE_API_BASE_URL=http://localhost:3050
npm install
npm run dev                        # http://localhost:5173
```

---

## Environment Variables

### Backend (`api-usa`)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URL` | Yes | MongoDB Atlas connection string |
| `SECRET` | Yes | JWT signing key |
| `NODE_ENV` | Yes | `production` for prod |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins |
| `PORT` | No | Default: 3050 |

### Frontend (`tigress-picks-prototype`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | Backend API URL (no trailing slash) |

---

## Tests

```bash
cd api-usa
npx vitest run    # 15 test files, 142+ tests
```

---

## Bracket Engine

The bracket engine handles FIFA's 2026 format complexities:

1. **Group stage** — 12 groups of 4 teams, round-robin (72 matches)
2. **Standings** — FIFA tiebreaker cascade: points > GD > GF > FIFA seed
3. **Third-place qualification** — Top 8 of 12 third-place teams advance
4. **Third-place slot assignment** — Backtracking solver assigns teams to R32 slots respecting eligibility constraints
5. **Knockout bracket** — R32 (16 matches) > R16 (8) > QF (4) > SF (2) > Third-place match > Final

The bracket engine runs on both client (for live cascade preview) and server (for validation).

---

## License

Private — Tigress Financial Partners internal use.
