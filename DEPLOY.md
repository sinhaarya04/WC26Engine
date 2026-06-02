# Deployment

Monorepo with two deployable projects:

```
FIFAPREDICTIONS/
├── api-usa/                  # Express + TypeScript + MongoDB (Mongoose)
└── tigress-picks-prototype/  # Vite + React frontend
```

Both projects read every secret and base URL from environment variables.
No secret has a silent default in production — the backend throws a clear
startup error if a required variable is missing (see
`api-usa/src/config/env.ts` → `assertSecretsForEnv`).

---

## Recommended topology

| Piece | Where | Why |
|---|---|---|
| Frontend (Vite static build) | **Vercel** | Vite output is pure static assets; Vercel serves them with a global CDN and zero config beyond a build command. |
| Backend (Express + Mongo) | **Render** or **Railway** | The API is a long-lived Express server with in-memory rate limiting, transactions via `mongoose.startSession().withTransaction()`, and morgan logging — all of which assume a persistent process. Vercel's serverless runtime kills processes between invocations and has 10s cold-start timeouts on Hobby; running Express as a Vercel function works but breaks the rate-limit semantics and adds cold-start latency to every Mongo transaction. Render's free web service keeps it warm and runs the existing `npm start` unchanged. |
| MongoDB | **MongoDB Atlas** (free M0 tier already in use) | Both the dev and prod backends point at it via `MONGODB_URL`. |

If you want the backend on Vercel anyway, see *Alternative: all-Vercel* at the bottom — it's possible but adds work and caveats.

---

## Backend → Render

### One-time setup

1. Push the monorepo to GitHub (e.g. `git@github.com:sinhaarya04/WC26Engine.git`).
2. In Render: **New → Web Service → Connect** the GitHub repo.
3. Service settings:
   - **Root Directory:** `api-usa`
   - **Build Command:** `npm install && npm run build` (compiles `src/**/*.ts` → `dist/`)
   - **Start Command:** `npm start` (runs the compiled server)
   - **Environment:** Node
   - **Region:** match your Atlas region for lowest latency
4. Environment variables (paste from `api-usa/.env.example`, fill real values):

| Key | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | Set to `production`. This is what triggers the strict-secret check. |
| `MONGODB_URL` | yes | Atlas connection string with username + password. Validated by `connectDb()` — server refuses to start on missing/malformed. |
| `SECRET` | yes | JWT signing key. Must NOT be the dev placeholder `worldcup2026_secret`. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `CORS_ORIGINS` | yes | Comma-separated list of frontend origins, e.g. `https://tigress-picks.vercel.app`. No `*` in prod. |
| `PORT` | optional | Render sets this automatically. The app reads it; you can omit. |
| `JWT_SECRET` | optional | Currently declared but unused by signing code — set if you want parity. |
| `ACCESSCODEDEV` | optional | Currently declared but unused. |
| `RATE_LIMIT_WINDOW` | optional | Default 60000 (ms). |
| `RATE_LIMIT_MAX` | optional | Default 500. |
| `LOG_LEVEL` | optional | Default `error` in prod. |
| `ENABLE_SWAGGER` | optional | `false` recommended in prod. |

5. After deploy, the API is reachable at `https://<service-name>.onrender.com`. Note that URL — the frontend env var points at it.

### Atlas network access

Add Render's outbound IPs to your Atlas IP allowlist (Atlas → Network Access). Easiest: allow `0.0.0.0/0` while bringing things up, then restrict.

---

## Frontend → Vercel

### One-time setup

1. In Vercel: **New Project → Import** the same monorepo.
2. Project settings:
   - **Root Directory:** `tigress-picks-prototype`
   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `dist` (default)
3. Environment variables (from `tigress-picks-prototype/.env.example`):

| Key | Value (prod) | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `https://<render-service>.onrender.com` | No trailing slash. The frontend's `lib/api.ts` strips trailing slashes but the convention is clean. |

4. Deploy. Vercel gives you `https://<project>.vercel.app`. Add that URL to the backend's `CORS_ORIGINS` and redeploy the backend — otherwise the browser blocks every request with a CORS error.

---

## Local development

No deployment changes required for local dev.

```bash
# Backend
cd api-usa
cp .env.example .env.development      # then fill in your real Atlas URL etc.
npm install
npm run dev                            # http://localhost:3050

# Frontend (separate terminal)
cd tigress-picks-prototype
cp .env.example .env.local             # keep VITE_API_BASE_URL=http://localhost:3050
npm install
npm run dev                            # http://localhost:5173
```

In non-production, the backend auto-allows `http://localhost:5173` and `http://localhost:3000` in CORS — you don't need to list them in `CORS_ORIGINS`.

---

## Tests before push

```bash
cd api-usa && npx vitest run            # 15 files, 142 tests
cd tigress-picks-prototype && npm run build
```

Both should be green. If either fails, do not push.

---

## Alternative: all-Vercel (backend as serverless functions)

Possible but **not yet implemented in this repo**. The work involved:

1. **Adapter:** add `api-usa/api/index.ts` that imports `createApp()` and exports the Express app as the default handler (Vercel routes `/api/*` → that function).
2. **`vercel.json`** with rewrites to forward all backend paths to the function.
3. **Connection cache:** mongoose connections must be cached across invocations on a global, otherwise each cold start opens a new TCP socket and you'll exhaust Atlas's connection limit fast. The pattern: stash the connection promise on `globalThis` and reuse.
4. **Rate limiter caveat:** `express-rate-limit` defaults to in-memory; each serverless invocation gets a fresh process, so the limiter becomes effectively useless. Swap to a Mongo or Redis-backed store, or accept that you've lost rate limiting.
5. **Cold-start latency on `withTransaction`:** the first PUT /predictions/bracket after a cold start opens both an HTTP handler AND a Mongo session AND a transaction. Expect ~2–4s on first hit.

If you want to switch to this path, ask and I'll implement the adapter + cache. Otherwise the split topology above is the supported one.
