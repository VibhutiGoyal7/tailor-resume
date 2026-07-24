# Tailor

Resume tailoring engine (Phase 1). A modular monolith — one codebase, multiple
deployables — per the [build brief](docs/tailor-build-brief.md).

- **`apps/web`** — Next.js, **API routes only** (no frontend pages). Runs as a
  long-running Node server (`next start`), _not_ Vercel serverless.
- **`apps/worker`** — plain Node process running the BullMQ tailoring pipeline
  (parse → retrieve → generate).
- **`apps/mobile`** — React Native (Expo) app.
- **`packages/db`** — Prisma schema + shared client (used by web _and_ worker).
- **`packages/modules`** — module facades (`auth`, `profile`, `resume-engine`) —
  the only way code crosses a module boundary (ADR-008).
- **`packages/shared-types`** — DTOs + the canonical API error shape, shared
  across web/worker/mobile.

> Read `CLAUDE.md` and `docs/` before contributing — module boundaries, the
> single error shape, the design tokens, and the git workflow are all load-bearing.

## Prerequisites

- **Node.js 20–22** (repo pins `>=20 <=23`; CI runs 22)
- **npm** (workspaces; no pnpm/yarn)
- **Docker** + Docker Compose (for local Postgres + Redis)

## Getting started

```bash
# 1. Install all workspace dependencies from the repo root
npm install

# 2. Start local infrastructure (Postgres w/ pgvector, Redis)
docker compose up -d

# 3. Set up environment — ONE .env at the repo root (single source of truth)
cp .env.example .env
#   Fill in secrets as you need them. The DATABASE_URL / REDIS_URL defaults in
#   .env.example already match the docker-compose services.
#   NOTE: keep this .env at the repo root, not inside packages/db. The db:*
#   scripts run Prisma from the repo root so this root .env is auto-loaded;
#   Prisma does NOT climb up from packages/db to find it.

# 4. Generate the Prisma client, then create the database schema
#    (run from the repo root so the root .env is picked up)
npm run db:generate
npm run db:migrate        # first run creates the initial migration

# 5. Run the pieces you need (separate terminals)
npm run dev  --workspace @tailor/web       # API server on PORT (default 3000)
npm run dev  --workspace @tailor/worker    # BullMQ worker
npm run start --workspace @tailor/mobile   # Expo dev server
```

Health check once `web` is up: `curl http://localhost:3000/api/health` → `{"status":"ok","service":"web"}`.

## Auth endpoints (Milestone 2, slice 1)

Email/password auth is live (`apps/web/app/api/auth/*`):

| Method + path            | Body                  | Result                                        |
| ------------------------ | --------------------- | --------------------------------------------- |
| `POST /api/auth/signup`  | `{ email, password }` | `201 { user }`                                |
| `POST /api/auth/login`   | `{ email, password }` | `200 { accessToken, refreshToken, user }`     |
| `POST /api/auth/refresh` | `{ refreshToken }`    | `200 { accessToken, refreshToken }` (rotates) |
| `POST /api/auth/logout`  | `{ refreshToken }`    | `204`                                         |

Protected routes use `requireAuth(req)` (Bearer access token). Access tokens last
15 min; refresh tokens rotate on every use and a reused (revoked) token revokes
the whole session (ADR-010). Login/signup are rate-limited to 7 attempts / 15 min.
_Next slice: email verification, password reset, Google sign-in, account routes._

## Quality gates (run before pushing)

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # Vitest (all workspaces) — DB integration tests SKIP by default
```

Database-backed integration tests (the auth signup/login/refresh flow) are gated
behind `RUN_DB_TESTS=1` so a plain `npm test` never touches your dev database.
To run them against a database (needs `docker compose up -d` + `npm run db:migrate`):

```bash
RUN_DB_TESTS=1 JWT_SECRET=dev-secret npm test
```

CI (`.github/workflows/ci.yml`) runs lint + the FULL suite (including DB tests
against an ephemeral Postgres) on every PR into `dev` and `main`; a red job
blocks merge (CLAUDE.md Section 2).

## Repo scripts (root)

| Script                            | What it does                 |
| --------------------------------- | ---------------------------- |
| `npm run lint`                    | ESLint across the monorepo   |
| `npm run format` / `format:check` | Prettier write / check       |
| `npm test`                        | Vitest across all workspaces |
| `npm run typecheck`               | `tsc -b` across TS packages  |
| `npm run db:generate`             | `prisma generate`            |
| `npm run db:migrate`              | `prisma migrate dev`         |
| `npm run db:validate`             | `prisma validate`            |
| `npm run db:studio`               | `prisma studio`              |

> All `db:*` scripts run Prisma from the repo root against
> `packages/db/prisma/schema.prisma`, so the single root `.env` is loaded.

## Git workflow

`main` (stable) ← `dev` (integration) ← `feature/*` / `fix/*` / `chore/*` branches.
Never commit directly to `main`. See CLAUDE.md Section 10 for identity/remote
requirements (this repo uses a personal GitHub identity via the `github-personal`
SSH alias) and branch naming.
