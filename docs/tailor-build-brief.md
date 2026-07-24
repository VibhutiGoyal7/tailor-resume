# Tailor — Phase 1 Build Brief

**Status:** Build-ready. This is the handoff spec for Claude Code — everything here is either already locked in the project doc/PRD/ADRs or decided in this session (stack, color). Nothing in this doc should be treated as a fresh decision point; if something looks undecided, it's flagged explicitly in Section 11.
**Scope:** Phase 1 only (Resume Tailoring Engine). Phase 2/3 tables and routes are not built now — the data model below only includes what Phase 1 needs, though `Application`/`JobListing` shapes from the project doc are noted for forward-compatibility.
**Companion docs:** `resume-copilot-project-doc.md` (why), `resume-copilot-prd.md` (what), `resume-copilot-learning-notes.md` (concepts explained) — this doc is the "how," assumes you've read the others.

---

## 1. Stack (updated this session)

| Layer | Choice | Notes |
|---|---|---|
| Mobile app | **React Native** (Expo recommended for faster iteration + `expo-secure-store` for token storage) | Flutter dropped from consideration |
| Backend API | **Next.js** (App Router, API routes only — no frontend pages needed) | Deployed as a standard Node server, **not** Vercel serverless functions (see worker note below) |
| Worker process | **Plain Node script** (`worker/index.ts`), same repo, same Prisma client, separate deployable | Next.js API routes are request/response; the async pipeline (ADR-009) needs a long-running process pulling from a queue. This is a second service, not a Next.js route. |
| Queue | Redis + **BullMQ** | Standard Node pairing, matches ADR-001/009 |
| Database | Postgres + **pgvector**, via **Prisma** | Neon or Supabase free tier |
| Embeddings | Voyage AI (`voyage-4` family) | ADR-003 |
| LLM | Anthropic API directly (Claude Sonnet for generation, Haiku for parsing/extraction) — no LangChain | ADR-004 |
| PDF rendering | `@react-pdf/renderer`, runs in the **worker** process | ADR-012 |
| DOCX rendering | `docxtemplater`, also in worker | ADR-012 |
| File storage | Cloudflare R2 | Generated resume files |
| Auth | Self-rolled JWT (argon2, access+refresh rotation) + **Resend** for transactional email | ADR-010 |
| Infra | Docker Compose locally; Render or Railway (two services: `web` running Next.js, `worker` running the Node worker) + Redis + Postgres add-ons; GitHub Actions CI/CD | ADR-013 |

**Why this doesn't break ADR-001:** the modular monolith decision was "one codebase, two deployables — API service and worker." Next.js satisfies "API service." The worker is unaffected by the backend framework choice; it was always going to be a separate process regardless of whether the API layer was NestJS, FastAPI, or Next.js. The one real constraint: **don't deploy the `web` service as Vercel serverless functions**, since a serverless function can't stay alive to run a queue consumer, and colocating the worker inside serverless would silently break ADR-009's staged-retry design. Deploy `web` as a normal long-running Node server on Render/Railway instead — Next.js supports this via `next start`.

---

## 2. Repo structure

```
tailor/
├── apps/
│   ├── web/                 # Next.js app — API routes only
│   │   ├── app/api/
│   │   │   ├── auth/
│   │   │   ├── profile/
│   │   │   ├── bank/
│   │   │   └── resumes/
│   │   └── ...
│   ├── worker/               # plain Node process
│   │   ├── src/
│   │   │   ├── tasks/
│   │   │   │   ├── parseJD.ts
│   │   │   │   ├── retrieveCandidates.ts
│   │   │   │   └── generateResume.ts
│   │   │   └── index.ts      # BullMQ worker entrypoint
│   └── mobile/                # React Native (Expo)
├── packages/
│   ├── db/                    # Prisma schema + client, shared by web + worker
│   ├── modules/                # module facades (ADR-008) — profile, resume-engine
│   └── shared-types/           # DTOs shared across web/worker/mobile
├── docker-compose.yml
└── .github/workflows/
```

Rationale: `packages/db` and `packages/modules` are shared between `web` and `worker` so both talk to the same Prisma client and the same module facades — `web`'s API routes call `resumeEngine.requestTailoredResume()`, and `worker`'s tasks call the same module's internal methods to actually do the work. This keeps ADR-008's "one facade per module" rule intact even though the module's code runs in two different deployables at different times.

---

## 3. Module architecture → Next.js mapping (ADR-008)

Four modules, one-directional dependency graph unchanged from the project doc:

```
profile  ←──────────┐
   ↑                 │
resume-engine    job-ingestion   (job-ingestion not built in Phase 1)
   ↑                 ↑
   └── applications ──┘            (not built in Phase 1)
```

For Phase 1, only `profile` and `resume-engine` are built. Each is a folder in `packages/modules/` exporting exactly one facade:

```ts
// packages/modules/profile/index.ts
export const profileModule = {
  getExperienceBank(userId) { ... },
  addExperienceItem(userId, input) { ... },
  getResumeBasics(userId) { ... },
  updateResumeBasics(userId, input) { ... },
};

// packages/modules/resume-engine/index.ts
export const resumeEngine = {
  requestTailoredResume(userId, jdText) { ... },   // returns { jobId } — enqueues "parse" task
  getJobStatus(jobId) { ... },                       // stage-level status (ADR-015)
  confirmRetrievedMatches(jobId, keptCandidateIds) { ... },  // ADR-017 — enqueues "generate" task
  getResume(resumeId) { ... },
  updateResumeLayout(resumeId, { sectionOrder, hiddenSections, layoutVariantId }) { ... },
};
```

Next.js API routes are thin — they do auth/validation, then call the facade, nothing else:

```ts
// apps/web/app/api/resumes/route.ts
export async function POST(req) {
  const { userId } = await requireAuth(req);
  const { jdText } = await req.json();
  const { jobId } = await resumeEngine.requestTailoredResume(userId, jdText);
  return Response.json({ jobId });
}
```

No cross-module DB access: `resume-engine`'s code never imports `profile`'s Prisma models directly — it calls `profileModule.getExperienceBank(userId)` to get bullets for retrieval.

---

## 4. Data model (Prisma schema, Phase 1 tables only)

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  emailVerified Boolean  @default(false)
  createdAt     DateTime @default(now())
}

model ExperienceItem {
  id               String   @id @default(cuid())
  userId           String
  type             String   // "role" | "project" | "education" | "skill"
  rawInput         String
  source           String   // "structured_form" | "freeform_extracted"
  structuredFields Json
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  bullets          ExperienceBullet[]
}

model ExperienceBullet {
  id               String   @id @default(cuid())
  experienceItemId String
  text             String
  tags             String[]
  impactMetric     String?
  status           String   // "suggested" | "accepted" | "edited" | "rejected"
  embedding        Unsupported("vector(1024)")  // pgvector, dims per voyage-4 model
  experienceItem   ExperienceItem @relation(fields: [experienceItemId], references: [id])
}

model ResumeBasics {
  id        String   @id @default(cuid())
  userId    String   @unique
  fullName  String
  phone     String?
  location  String?
  links     Json      // { linkedin, portfolio, github }
  summary   String?
  updatedAt DateTime  @updatedAt
}

model TailoredResume {
  id                  String   @id @default(cuid())
  userId              String
  jdText              String
  jdParsed            Json      // { required_skills[], role_type, seniority, company_type, key_responsibilities[] }
  templateId          String
  sectionOrder        String[]
  hiddenSections       String[]
  layoutVariantId      String?
  selectedBulletIds    String[]
  retrievedCandidateIds String[]  // full candidate set, pre-confirmation (ADR-017)
  renderedContent      Json?
  version              Int      @default(1)
  createdAt            DateTime @default(now())
}

model TailoringJob {
  id                String   @id @default(cuid())
  userId            String
  tailoredResumeId  String?
  stage             String   // "parsing" | "retrieving" | "awaiting_confirmation" | "generating" | "done" | "failed"
  failedStage       String?  // which stage failed, if any — drives ADR-015 stage-aware retry UI
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   // never store raw refresh tokens (ADR-010)
  revoked   Boolean  @default(false)
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

Note: `TailoringJob` isn't in the original project doc's Section 6 table but is required to make ADR-015 (stage-level polling) and ADR-017 (two-phase confirm) actually implementable — it's the row `GET /resumes/jobs/:jobId` reads.

---

## 5. API contracts (REST, ADR-011)

Route groups map to module facades. Base path `/api`.

### Auth
```
POST /api/auth/signup            { email, password } → 201
POST /api/auth/verify-email       { token } → 200
POST /api/auth/login              { email, password } → { accessToken, refreshToken }
POST /api/auth/google              { firebaseIdToken } → { accessToken, refreshToken }  (verifies token server-side, creates User if new, ADR-010 addendum)
POST /api/auth/refresh            { refreshToken } → { accessToken, refreshToken }  (rotates, ADR-010)
POST /api/auth/logout             { refreshToken } → 204 (revokes)
POST /api/auth/forgot-password    { email } → 200
POST /api/auth/reset-password     { token, newPassword } → 200
```
Rate limit: 7 attempts on `/login` and `/signup` (ADR-010).

### Profile (Bank + Resume Basics)
```
GET    /api/bank                        → ExperienceItem[] grouped by type
POST   /api/bank/items                  { type, structuredFields | rawInput } → ExperienceItem
POST   /api/bank/items/:id/extract      (for freeform/import) → ExperienceBullet[] (status: "suggested")
PATCH  /api/bank/bullets/:id             { status, text? } → ExperienceBullet   (accept/edit/reject)
GET    /api/bank/basics                  → ResumeBasics
PUT    /api/bank/basics                  → ResumeBasics
```

### Account & settings (added — surfaced as a gap by the PRD's traceability table)
```
GET    /api/account                      → { email, emailVerified, createdAt }
PATCH  /api/account/password              { currentPassword, newPassword } → 200
DELETE /api/account                       → 204  (cascades: ExperienceItem/Bullet, TailoredResume, RefreshToken)
```
Notification preferences: not building a real preferences system in Phase 1 — the Profile screen's "Notifications" row is a placeholder for Phase 2+ (this app currently sends no push/marketing notifications to have preferences over). Note this explicitly rather than silently building nothing.

### Resume tailoring (two-phase async, ADR-017)
```
POST   /api/resumes                      { jdText } → { jobId }
                                          # enqueues "parse" task only

GET    /api/resumes/jobs/:jobId          → { stage, failedStage?, retrievedCandidates? }
                                          # stage-level status per ADR-015; once stage = "awaiting_confirmation",
                                          # response includes retrievedCandidates for the checkpoint screen

POST   /api/resumes/jobs/:jobId/confirm  { keptCandidateIds[] } → 202
                                          # ADR-017 — only now enqueues "generate" task

POST   /api/resumes/jobs/:jobId/retry    → 202
                                          # re-enqueues only the failed stage (ADR-015), not the whole pipeline

GET    /api/resumes                       → TailoredResume[]  (history)
GET    /api/resumes/:id                   → TailoredResume    (detail, incl. per-bullet source trace)
PATCH  /api/resumes/:id/layout            { sectionOrder, hiddenSections, layoutVariantId } → TailoredResume
GET    /api/resumes/:id/export?format=pdf|docx → binary file
DELETE /api/resumes/:id                   → 204
```

**Two-phase contract detail (the ADR-017 consequence flagged in the project doc):** this is the one place Phase 1's API meaningfully deviates from "fire the whole pipeline, poll once." The sequence is:

1. `POST /api/resumes` → worker runs `parseJD` task → on success enqueues `retrieveCandidates` task → on success, job stage becomes `awaiting_confirmation` and **stops** (does not auto-enqueue generate).
2. Client polls `GET /api/resumes/jobs/:jobId`, sees `stage: "awaiting_confirmation"` with the candidate list, renders the "Here's what we found" screen.
3. User unchecks anything wrong, taps confirm → `POST /api/resumes/jobs/:jobId/confirm` → **this** is what enqueues `generateResume`.
4. Client resumes polling until `stage: "done"`.

No new task types needed — this is enforced by the worker simply not chaining `retrieveCandidates → generateResume` automatically, and a separate route enqueuing the third task explicitly.

### Error response convention (applies to every route above)

Every non-2xx response uses one shape:
```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Email or password is incorrect." } }
```
- `code` is a stable, machine-readable string (SCREAMING_SNAKE_CASE) the client can switch on — never just an HTTP status.
- `message` is human-readable, safe to show directly in the UI.
- Validation errors (400) additionally include a `fields` array: `{ "field": "email", "issue": "required" }` per invalid field.
- Status codes: 400 validation, 401 unauthenticated, 403 unauthorized (e.g. accessing another user's resume), 404 not found, 409 conflict (e.g. email already registered), 429 rate-limited, 500 unexpected.

### Pagination (list endpoints)

`GET /api/resumes` and any future list endpoint use cursor-based pagination: `?cursor=<id>&limit=20` (default limit 20, max 50), response includes `{ items: [...], nextCursor: string | null }`. Not offset-based — cursor pagination stays correct as new resumes are created between page loads.

---

## 6. Auth implementation detail (ADR-010 — flagged for extra scaffolding)

Since this is genuinely new territory (backend-side auth, not just consuming it), spelling out each piece:

- **Password hashing:** `argon2` package, `argon2.hash(password)` on signup, `argon2.verify(hash, password)` on login. Never bcrypt/sha256/hand-rolled.
- **Access token:** JWT, 15 min expiry, signed with a server-side secret (HS256 is fine at this scale — no need for RS256/asymmetric keys for a single-backend setup). Payload: `{ userId, iat, exp }` only — no sensitive data in the payload since JWTs are base64, not encrypted.
- **Refresh token:** a separate long random string (not a JWT necessarily — a random 32-byte token is simpler and equally secure here), stored **hashed** (argon2 or even sha256 is fine for this since it's not a password) in `RefreshToken.tokenHash`. Never store the raw refresh token server-side.
- **Rotation:** every call to `/auth/refresh` issues a *new* refresh token, marks the old row `revoked: true`. If a revoked token is ever presented again, treat it as a compromise signal — revoke all of that user's refresh tokens (defense against token theft/replay).
- **Rate limiting:** simple in-memory or Redis-backed counter keyed by IP+email on `/login` and `/signup`, 7 attempts then temporary lockout.
- **Mobile storage:** `expo-secure-store`, never `AsyncStorage`, for both tokens.
- **Email verification/reset:** Resend API, a token (random string, stored server-side with expiry) emailed as a link/deep-link the app can capture.
- **Google sign-in (added this session):** mobile app uses the Firebase client SDK to run Google's OAuth flow and obtain a Firebase ID token — Firebase is used purely for this handshake, nothing else. That token is sent to `POST /api/auth/google`, where the backend verifies it server-side using the Firebase Admin SDK (checks signature, issuer, expiry), looks up or creates the `User` row by the verified email, and mints our own access/refresh JWT pair exactly like `/auth/login` does. From that point on, Google-authenticated users are indistinguishable from email/password users in the session model — same `RefreshToken` table, same rotation/revocation rules. Firebase never issues a session of its own.

Build order suggestion for this module specifically: signup+hash → login+access/refresh issue → verify-email → protected-route middleware → refresh+rotation → logout/revocation → rate limiting → password reset. Get each step actually working and tested before stacking the next, since this is the module where an undetected subtle bug matters most.

---

## 7. Tailoring pipeline — worker tasks (ADR-004, ADR-009)

Three BullMQ queues (or one queue, three job names — either works, but separate queues make monitoring/concurrency limits per-stage cleaner given LLM calls are the expensive one):

```ts
// worker/src/tasks/parseJD.ts
// input: { jobId, jdText }
// calls Claude Haiku, structured output (tool use) → jd_parsed JSON
// on success: save to TailoringJob, enqueue retrieveCandidates
// on failure: TailoringJob.failedStage = "parsing", stage stays "parsing"

// worker/src/tasks/retrieveCandidates.ts
// input: { jobId }
// embeds each key_responsibility + required_skill separately (Voyage), pgvector cosine search per query,
// union+dedupe, hybrid tag re-rank (ADR-003)
// on success: TailoringJob.stage = "awaiting_confirmation", store retrievedCandidateIds
// (does NOT enqueue generate — waits for POST /confirm)

// worker/src/tasks/generateResume.ts
// input: { jobId, keptCandidateIds }
// calls Claude Sonnet with structured JD + kept candidates + template constraints
// requests structured output selecting bullets, rewriting phrasing, with grounding references
// on success: TailoredResume created, TailoringJob.stage = "done"
```

Retry (ADR-015): `POST /resumes/jobs/:jobId/retry` re-enqueues only whichever task matches `failedStage` — reusing the same input the failed attempt had, not restarting from `parseJD`.

---

## 8. Design tokens for React Native (locked palette, this session)

```ts
export const colors = {
  background: '#F1F3F4',
  ambientLight: '#E4EAEC',
  ambientLight2: '#EAEFF0',
  ambientDot: '#D6E1E4',
  cardBorder: '#E4E9EB',
  accent: '#2F4858',        // primary CTA, active nav, primary icon fill
  accentOnDark: '#5B8AA6',  // same role on dark surfaces
  badgeTint: '#DDE6E9',     // match-score badge background
  ink: '#1D2226',           // primary text
  textSecondary: '#7B8681', // muted labels/timestamps
  iconMuted: '#A9B2B6',     // inactive nav icons
};
```

Shape language: asymmetric corner radii per card (e.g. `26px 10px 26px 10px`, not uniform), 1–2° alternating rotation on list cards (resume history), wavy/organic section dividers rather than straight rules. Illustration motifs (paper airplane / signature flourish / growing sprout / dog-eared page) per the mapping in the project doc's Section 9b — implement these as SVG assets, not icon-font glyphs.

**Animated building-blocks motif (added this session, replaces an earlier flight-loop attempt):** the two staged-progress screens (parse/retrieve, generate) use an animated motif of content bars sliding up from below and slotting into a dashed resume-page silhouette — title bar first, then three content lines staggered in, hold fully built for a beat, then all drop away together and the cycle restarts. Ties to the same "building" metaphor as the growing-sprout motif used on the first-run-choice screen, rather than introducing an unrelated visual. Source SVG (`tailor_motif_stacking_blocks.svg`) uses SMIL (`<animateTransform>`/`<animate>`) for the loop, which works in a browser/SVG-preview context but **does not run in React Native** — `react-native-svg` doesn't execute SMIL. For the real app, rebuild this exact animation driven by `react-native-reanimated` (`useAnimatedProps` on each bar's translateY and opacity, looping with `withRepeat`/`withSequence`/`withTiming`), using the same keyTimes/values baked into the source SVG as a reference (four bars, 2.4s total cycle, staggered entrance every ~0.4s, hold ~1.2s, synchronized drop-away ~0.3s).

---

## 8b. Environment variables (`.env` reference)

*(Surfaced as a gap during a doc review — nothing previously enumerated what a fresh clone actually needs to run.)*

```bash
# Database & queue
DATABASE_URL=postgresql://...          # Neon/Supabase connection string, pgvector extension enabled
REDIS_URL=redis://...                  # BullMQ connection

# Auth
JWT_SECRET=                            # HS256 signing secret, access tokens
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=                 # Firebase Admin SDK service account, for verifying Google ID tokens
FIREBASE_PRIVATE_KEY=

# LLM & embeddings
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=

# Email
RESEND_API_KEY=

# File storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=

# App
NODE_ENV=development | production
PORT=3000
```

Both `web` and `worker` deployables need the full set (they share the Prisma client and, in the worker's case, need Anthropic/Voyage/R2/Resend directly). Keep a `.env.example` with these keys (no real values) committed to the repo from milestone 1 — a real `.env` never gets committed.

---

## 9. Suggested build order (milestones)

1. **Repo scaffold** — monorepo structure, Docker Compose (Postgres+pgvector, Redis), Prisma schema, CI skeleton (lint+test on PR)
2. **Auth module** end-to-end (Section 6 above), deployed early so every later screen has something real to authenticate against
3. **Profile module** — Experience Bank CRUD + bullet accept/edit/reject flow, Resume Basics
4. **Resume-engine, stage 1** — `parseJD` task + `POST /resumes` + polling endpoint, no retrieval/generation yet — proves the queue/worker split works
5. **Resume-engine, stage 2** — embeddings + `retrieveCandidates`, pgvector wired up, the ADR-017 confirmation checkpoint
6. **Resume-engine, stage 3** — `generateResume`, template rendering (react-pdf), DOCX export
7. **Layout customization** — section reorder/hide, layout variants
8. **Mobile app** — can start in parallel once Section 5's contracts are stable; auth screens first, then Bank, then the tailoring flow, then Resumes/Profile
9. **Deploy live** — Render/Railway, both services, from as early as milestone 2 onward (project doc's "deploy from week one," not deploy-at-the-end)

---

## 9b. Templates (ADR-018, decided this session)

**3 templates** for Phase 1 — each needs its own react-pdf component tree *and* docxtemplater mapping (ADR-012):

| Template | For | Layout |
|---|---|---|
| Clean/ATS-safe | Most users, ATS-parsing-sensitive | Single column, minimal styling |
| Modern two-column | Mid-to-senior, more designed look | Sidebar (skills/contact) + main column |
| Compact/dense | Senior candidates, one-page-fit need | Tighter spacing, smaller type |

Sourced from existing **open-source** resume template layouts (e.g. JSON Resume themes, Reactive Resume's template set — MIT-licensed patterns, not commercial products like Zety/Canva) and restyled to Tailor's own design system (Section 8) — this saves design time, not the render-engineering cost of building each renderer pair.

---

## 10. Open items (not decided, don't treat as settled)

- Which specific layout *variants* each of the 3 templates gets (e.g. one-column vs. two-column within "Modern two-column") isn't designed yet — needed before milestone 7.
- Observability specifics (which logging library, whether a real dashboard tool like Axiom/Better Stack is worth it vs. Render/Railway's built-in log viewer) — low priority, deferred to deploy time (milestone 9), no pressure since the project isn't going live imminently.
- Profile & settings screen's account actions (change password, delete account) now have routes specified (Section 5) but haven't been built or wired into a milestone explicitly — fold into milestone 2 (auth module) rather than treating as a separate pass.
