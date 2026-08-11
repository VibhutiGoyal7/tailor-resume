# Tailor — Phase 1 Build Brief

**Status:** Build-ready. This is the handoff spec for Claude Code — everything here is either already locked in the project doc/PRD/ADRs or decided in this session (stack, color). Nothing in this doc should be treated as a fresh decision point; if something looks undecided, it's flagged explicitly in Section 11.
**Scope:** Phase 1 only (Resume Tailoring Engine). Phase 2/3 tables and routes are not built now — the data model below only includes what Phase 1 needs, though `Application`/`JobListing` shapes from the project doc are noted for forward-compatibility.
**Companion docs:** `resume-copilot-project-doc.md` (why), `resume-copilot-prd.md` (what), `resume-copilot-learning-notes.md` (concepts explained) — this doc is the "how," assumes you've read the others.

---

## 1. Stack (updated this session)

| Layer | Choice | Notes |
|---|---|---|
| Mobile app | **React Native** (Expo SDK 52, RN 0.76 + `expo-secure-store` for token storage) | Flutter dropped from consideration |
| Mobile navigation | **React Navigation 7** (`native-stack` + `bottom-tabs`) | Milestone 8 — chosen over Expo Router for explicit control of the "auth stack outside the tabs" structure |
| Mobile server state | **TanStack Query 5** (`@tanstack/react-query`) | Milestone 8 — handles the polling-heavy tailoring flow (ADR-015 job status), caching, retries |
| Mobile SVG | `react-native-svg` | Milestone 8 — for the illustration motifs + the building-blocks progress motif (animated via RN's built-in `Animated`, not reanimated — see the motif note below) |
| Mobile file picker | `expo-document-picker` | Milestone 8 — "Import from resume" file selection (PDF/DOCX) |
| Mobile file export | `expo-file-system` + `expo-sharing` | Milestone 8 — the export screen streams the rendered PDF/DOCX to a cache file (`downloadAsync` with the bearer header) and hands it to the OS share/save sheet |
| Backend API | **Next.js** (App Router, API routes only — no frontend pages needed) | Deployed as a standard Node server, **not** Vercel serverless functions (see worker note below) |
| Resume file parsing | `unpdf` (PDF→text) + `mammoth` (DOCX→text) | Milestone 8 — web-route parsing for `POST /bank/import` (Node runtime); kept out of the module facade so it stays file-parser-free |
| Worker process | **Plain Node script** (`worker/index.ts`), same repo, same Prisma client, separate deployable | Next.js API routes are request/response; the async pipeline (ADR-009) needs a long-running process pulling from a queue. This is a second service, not a Next.js route. |
| Queue | Redis + **BullMQ** | Standard Node pairing, matches ADR-001/009 |
| Database | Postgres + **pgvector**, via **Prisma** | Neon or Supabase free tier |
| Embeddings | Voyage AI (`voyage-4` family) | ADR-003 |
| LLM | Anthropic API directly (Claude Sonnet for generation, Haiku for parsing/extraction) — no LangChain | ADR-004 |
| PDF rendering | `@react-pdf/renderer`, runs in the **worker** process (needs React 18 — see note) | ADR-012 |
| DOCX rendering | **`docx`** (programmatic; supersedes `docxtemplater` — ADR-012 amendment, M6), also in worker | ADR-012 |
| File storage client | `@aws-sdk/client-s3` (R2 is S3-compatible), behind a `FileStore` interface; local-disk fallback in dev | ADR-012 / M6 |
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

For Phase 1, three modules are built: **`auth`**, `profile`, and `resume-engine`. Each is a folder in `packages/modules/` exporting exactly one facade.

> **`auth` recorded as a Phase-1 module (Milestone 2 decision).** Section 5's "route groups map to module facades" implies an auth facade, but the graph above (inherited from the project doc) predates that and omitted it. Resolving the gap: `auth` is its own module, owning the `User` and `RefreshToken` tables. Every other module deals only in `userId` strings, so the no-cross-module-Prisma rule (CLAUDE.md Section 1) holds — nothing else imports `User`. `auth` has no dependency on `profile`/`resume-engine`; it sits to the side of the graph and is consumed only by the web app's `/api/auth/*` and `/api/account/*` routes.

```ts
// packages/modules/auth/index.ts
export const authModule = {
  signup(input) { ... },              // -> AuthUser (does not log in; contract: 201; sends verify email)
  login(input) { ... },               // -> { user, tokens }  (argon2 verify + issue pair)
  refresh(rawRefreshToken) { ... },   // rotate + reuse-detection (ADR-010)
  logout(rawRefreshToken) { ... },    // revoke (idempotent)
  verifyAccessToken(token) { ... },   // -> { userId }  (used by requireAuth middleware)
  verifyEmail(rawToken) { ... },      // consume email_verify token -> emailVerified = true
  forgotPassword(email) { ... },      // send reset link (silent for unknown email)
  resetPassword(rawToken, newPw) { ... }, // consume password_reset token, revoke all sessions
  getAccount(userId) { ... },         // -> { email, emailVerified, createdAt }
  changePassword(userId, cur, next) { ... }, // verify current, revoke other sessions
  deleteAccount(userId) { ... },      // manual cascade over all user-owned rows
  // slice 2b: googleSignIn(firebaseIdToken)
};

// packages/modules/profile/index.ts
export const profileModule = {
  getExperienceBank(userId) { ... },                 // items grouped by type, with bullets
  addExperienceItem(userId, input) { ... },          // structured item (source "structured_form")
  addBullet(userId, itemId, input) { ... },          // manual bullet (status "accepted"); M3
  updateBullet(userId, bulletId, input) { ... },     // accept/edit/reject (PATCH /bank/bullets/:id)
  getResumeBasics(userId) { ... },
  updateResumeBasics(userId, input) { ... },         // upsert (PUT semantics)
  // M4: extractBullets(userId, itemId) — LLM (Haiku) freeform extraction
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
  matchScore           Int?      // 0–100 JD match score, computed at generate (see note)
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

Note (Milestone 3): `ExperienceBullet.embedding` is now **nullable** (`vector(1024)?`). Bullets are created in Milestone 3, but embeddings (Voyage) are computed in Milestone 5 — so a bullet exists before it's embedded. The original schema had it non-null, which the build order can't satisfy; nullable reconciles it.

Note (Milestone 8): `TailoredResume.matchScore` (`Int?`, 0–100) is the RAG pipeline's signature output (project doc §9b — the result-screen dial and the history-card badge). Computed at the **generate** stage over the *selected* candidates by `resume-engine`'s pure `computeMatchScore(jdParsed, selectedCandidates)` and persisted alongside `renderedContent`. No exact formula was specified in the docs, so the first definition is a 50/50 blend of two explainable components: **coverage** (fraction of the JD's `required_skills` that at least one selected bullet is tagged with) and **strength** (mean of the selected bullets' hybrid semantic+tag retrieval scores from ADR-003, each clamped to [0,1]); when the JD lists no required skills, the score is strength alone. Surfaced on `TailoredResumeSummary.matchScore` and `TailoredResumeView.matchScore` (null for resumes generated before this shipped). *(Open for the owner: confirm the 50/50 weighting, or swap in a different formula — the computation is isolated in one pure function.)*

Note (Milestone 2, slice 2): added `VerificationToken` — single-use tokens for **email verification** and **password reset**, distinguished by a `type` field (`"email_verify" | "password_reset"`). Stored hashed (sha256) with an `expiresAt` and a nullable `usedAt` (single-use). This is the "token stored server-side with expiry" that Section 6 requires; it wasn't enumerated in the original data model.

```prisma
model VerificationToken {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String
  type      String   // "email_verify" | "password_reset"
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
  @@index([userId])
  @@index([tokenHash])
}
```

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
POST   /api/bank/items/:id/bullets      { text, tags?, impactMetric? } → ExperienceBullet (status: "accepted")  # manual add (M3)
DELETE /api/bank/items/:id              → 204  (removes the item + its bullets; user-scoped)                    # (M8)
POST   /api/bank/items/:id/extract      → ExperienceItem (appends bullets, status: "suggested")                 # LLM (M8) — "Save and extract bullets" from an item's saved description
POST   /api/bank/extract                { text, type? } → 201 ExperienceItem (source freeform_extracted, suggested bullets)  # LLM (M8) — the "Write about it" flow (Claude infers type + fields + bullets)
POST   /api/bank/import                  multipart file (PDF/DOCX, ≤5MB) → 201 ExperienceItem[] (suggested bullets)          # LLM (M8) — "Import from resume" (parse file → text → extract every experience)
PATCH  /api/bank/bullets/:id             { status, text? } → ExperienceBullet   (accept/edit/reject)
GET    /api/bank/basics                  → ResumeBasics | null
PUT    /api/bank/basics                  → ResumeBasics
```

Note (M8): bank extraction runs **synchronously** inside the web request (a single Haiku call via `profileModule` → `getBankExtractor()`), not through the worker queue like JD parsing. Bank extraction is short and interactive (write → extract → review in one round-trip), so a staged/polled job would only add latency and UI complexity; the JD pipeline stays async because it chains parse → retrieve → generate. Same stub-fallback as the JD parser: no `ANTHROPIC_API_KEY` → `StubBankExtractor` (deterministic canned bullets) so the flow runs end-to-end without a key. **File import** ("Import from resume") is also built: `POST /bank/import` takes a multipart PDF/DOCX (≤5MB), the web route turns it into text (`unpdf` for PDF, `mammoth` for DOCX; parse lives in the route, not the module facade, so the facade stays file-parser-free), then `extractResume` pulls every experience out as its own `freeform_extracted` item with suggested bullets. The mobile app picks the file with `expo-document-picker` and reviews all items together on an import-review screen.

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

GET    /api/resumes/jobs/:jobId          → { stage, failedStage?, resumeId?, retrievedCandidates?, renderedContent? }
                                          # stage-level status per ADR-015; once stage = "awaiting_confirmation",
                                          # response includes retrievedCandidates for the checkpoint screen.
                                          # resumeId (M8): the TailoredResume this job created (null while parsing),
                                          # so the mobile flow can jump from a finished job to the result/export
                                          # screens, which are keyed on the resume, not the job.

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

### Implementation status — Milestones 4–6 (parse + retrieve + generate stages)

The **parse**, **retrieve**, and **generate** stages are all implemented end-to-end — a JD now runs the full pipeline through to a persisted tailored resume (`stage: "done"`).

- **Where the logic lives.** All stage logic is in the `resume-engine` facade (`runParseStage`, `runRetrieveStage`, `confirmRetrievedMatches`), not the worker. The worker's `parseJD` / `retrieveCandidates` tasks are one-liners that call the facade (CLAUDE.md §1: business logic in the module, worker tasks thin). The facade also owns `requestTailoredResume` (create `TailoringJob` @ `parsing` + enqueue) and `getJobStatus` (user-scoped poll).
- **Queue producer.** `resume-engine` is the producer, behind an injectable `Enqueuer` interface (`BullMqEnqueuer` in prod; an in-memory fake in tests) with `enqueueParse` / `enqueueRetrieve`. `QUEUE_NAMES` + job payloads live once in `shared-types`; both the producer and `apps/worker` import them (worker's `queues.ts` re-exports them) so names can't drift.
- **External services are behind interfaces with stub fallbacks (auto-selected):**
  - `JdParser`: `AnthropicJdParser` (Claude Haiku, ADR-004) when `ANTHROPIC_API_KEY` is set, else `StubJdParser` (canned parse in `STUB_JD_PARSED`).
  - `Embedder`: `VoyageEmbedder` (voyage-4 family, `output_dimension: 1024`) when `VOYAGE_API_KEY` is set, else `StubEmbedder` (deterministic offline unit vectors). Both selected in `getEmbedder()`.
  - So the whole parse→retrieve pipeline runs and demos with **no external keys**; adding a key switches to the real service with zero code change. With stubs, retrieval exercises the real plumbing but ranking is not semantically meaningful (random stub vectors) — real ranking needs the real embedder + parser.
- **Retrieve stage (ADR-003 / ADR-004 step 2).** `runRetrieveStage`: (1) **lazy embedding backfill** — kept bullets (`status IN ('accepted','edited')`) missing a vector get embedded in the *worker* (M5 decision: embedding runs worker-side, not in the web write path, per ADR-009 + owner sign-off); (2) each `key_responsibility`/`required_skill` embedded *separately* and searched via pgvector cosine (`<=>`); (3) union + **hybrid re-rank** (semantic similarity + bounded tag boost for exact required-skill tag matches); (4) persist candidates, stop at `awaiting_confirmation`.
- **Module boundary (ADR-008).** `resume-engine` never queries profile's `ExperienceBullet` table. The pgvector raw SQL (Prisma's typed client can't touch an `Unsupported` vector column) lives in **profile** facade methods: `getBulletsNeedingEmbedding`, `setBulletEmbedding`, `searchBulletsByVector`. resume-engine computes vectors (via the shared `Embedder`) and consumes those methods.
- **ADR-017 checkpoint.** Retrieve does **not** auto-enqueue generate. `GET /jobs/:jobId` returns `retrievedCandidates` (persisted snapshot with text/tags/score in new `TailoredResume.retrievedCandidates` Json column). `POST /jobs/:jobId/confirm { keptCandidateIds }` validates the kept set ⊆ retrieved and records `selectedBulletIds`.
- **Generate stage (ADR-004 step 3 / Milestone 6).** `confirmRetrievedMatches` now records the kept set, advances the job `awaiting_confirmation → generating`, and enqueues `generateResume` — this is the **only** place generate is enqueued (ADR-017 two-phase; the worker never auto-chains retrieve→generate). `runGenerateStage`: (1) loads the parsed JD + the kept candidate snapshot (`selectKeptCandidates` over the persisted `retrievedCandidates`, so it never re-queries profile's tables — ADR-008); (2) pulls optional Resume Basics (name/summary) via `profileModule.getResumeBasics` to steer the tailored summary; (3) calls the injectable `ResumeGenerator` for a **structured** selection/rewrite; (4) **reconciles grounding** (`reconcileGeneratedResume` — drops any bullet whose `sourceBulletId` isn't in the kept set so a hallucinated ref can't leak in, attaches the real `experienceItemId` for the per-bullet source trace, dedupes, caps at `MAX_GENERATED_BULLETS = 12`); (5) persists `renderedContent` and advances `generating → done`. On failure: `failedStage = "generating"`, rethrow. `GET /jobs/:jobId` now also returns `renderedContent` once `done`.
  - **Generator behind an interface with stub fallback (auto-selected), same pattern as parse/retrieve:** `AnthropicResumeGenerator` (Claude Sonnet — `RESUME_GEN_MODEL = "claude-sonnet-5"`, ADR-004 — with structured output + adaptive thinking) when `ANTHROPIC_API_KEY` is set, else `StubResumeGenerator` (deterministic: selects the kept candidates in ranked order and echoes their text, faithful/never-inventing, with a canned JD-derived summary). So the full parse→retrieve→confirm→generate pipeline runs and demos **keyless**; adding a key switches to real Sonnet generation with zero code change. With the stub, the *plumbing* is exercised end-to-end but the rewriting is not semantically meaningful — real tailoring needs the real generator.
- **Render + export (ADR-012 / ADR-018, Milestone 6 slice 2).** `runGenerateStage` now also renders the export files and stores them: it renders **PDF** (`@react-pdf/renderer`) and **DOCX** (`docx`) for the resume's template, uploads both via the `FileStore`, and records the keys on `TailoredResume.exportFiles`. `templateId` is chosen at parse time by rule-based auto-suggestion from `company_type` (`suggestTemplateId`, ADR-012 — retires the old `"classic"` placeholder). **3 templates** are implemented for both formats (ADR-018): `ats` (Clean/ATS-safe, default), `modern` (two-column), `compact` (dense) — registry + metadata in `shared-types` (`TEMPLATES`).
  - **Renderer boundary (CLAUDE.md §7).** The render deps (`@react-pdf/renderer`, `docx`) live only in `apps/worker`; the renderer is *injected* into the resume-engine facade at worker startup (`setResumeRenderer`), so the `web` deployable never imports them. `FileStore` (in `packages/modules`) moves bytes only and is safe for web to import.
  - **Storage (keyless).** `FileStore` = `R2FileStore` (`@aws-sdk/client-s3`) when `R2_*` is set, else `LocalFileStore` (writes under `FILE_STORE_DIR`), so the whole pipeline — including download — runs with no cloud account.
  - **New routes.** `GET /resumes/:id` (detail: template, jd_parsed, renderedContent, `availableFormats`) and `GET /resumes/:id/export?format=pdf|docx` (streams the stored file as an attachment). Both facade-backed (`getResume`, `getResumeExport`), user-scoped.
  - **React 18 pin.** `@react-pdf/renderer` 4.x needs React 18; pinned repo-wide via npm `overrides` (web is API-only, mobile/RN already on 18.3.1) — see the ADR-012 amendment in the project doc.
- **Resume history + delete (Milestone 7 slice 1).** `GET /resumes` → `resumeEngine.listResumes`: newest-first, user-scoped `TailoredResumeSummary` rows (role/company from the parsed JD + which formats are ready) — lighter than the detail view, for the history screen's cards. `DELETE /resumes/:id` → `resumeEngine.deleteResume`: 404 for a missing/other user's resume; deletes the stored export files (new idempotent `FileStore.delete`, best-effort so a stuck file never strands the row) then the linked `TailoringJob` + resume row in one transaction.
- **Layout customization (Milestone 7 slice 2).** `PATCH /resumes/:id/layout` → `resumeEngine.updateResumeLayout`: partial update of section order / hidden sections / layout variant / **template override** (the build brief's contract lists the three layout fields; the project doc's M7 scope also names template override, so an optional `templateId` is included, validated against `TEMPLATE_IDS`). User-scoped (404); **409** until the resume is generated (nothing to lay out); the layout variant is validated against the effective template (`LAYOUT_VARIANTS`). It persists the layout, keeps `renderedContent.templateId` in sync, and **enqueues a re-render**, returning the updated detail view immediately.
  - **Re-render (async, worker-only).** Because the renderers are worker-only (CLAUDE.md §7), the PATCH can't render on the web side. A new `render-resume` BullMQ queue + `renderResume` task calls `resumeEngine.runRenderStage(resumeId)`, which re-renders PDF/DOCX from the stored `renderedContent` + new layout and **overwrites the export files in place** (deterministic FileStore keys → the download URL never changes; the client just re-downloads). Resume-scoped — no `TailoringJob` stage machine, since it runs after the pipeline is `done`. `RenderedResume` now carries `skills` so a re-render needs no retrieval candidates in hand.
  - **Renderers honor layout.** Both renderers walk a shared `visibleSections` (resolved order minus hidden) so PDF and DOCX match; `modern-right` flips the sidebar (`sidebarOnRight`). **Layout variants (ADR-018 follow-up):** a deliberately small set — `modern` gets sidebar left/right (the one meaningful two-column choice), the single-column templates get one canonical variant each; richer variants remain a documented follow-up (§10).

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

**Animated building-blocks motif (added this session, replaces an earlier flight-loop attempt):** the two staged-progress screens (parse/retrieve, generate) use an animated motif of content bars sliding up from below and slotting into a dashed resume-page silhouette — title bar first, then three content lines staggered in, hold fully built for a beat, then all drop away together and the cycle restarts. Ties to the same "building" metaphor as the growing-sprout motif used on the first-run-choice screen, rather than introducing an unrelated visual. Source SVG (`tailor_motif_stacking_blocks.svg`) uses SMIL (`<animateTransform>`/`<animate>`) for the loop, which works in a browser/SVG-preview context but **does not run in React Native** — `react-native-svg` doesn't execute SMIL. **Built (Milestone 8) as `components/brand/motifs/BuildingBlocks.tsx`** using React Native's **built-in `Animated`** API rather than adding `react-native-reanimated`: a single 0→1 looping driver (`Animated.loop(Animated.timing(...))`) with one `interpolate` per bar for translateY + opacity, ported directly from the SVG's keyTimes/values. Since only transform + opacity animate, it runs on the native driver — no need for a heavier native animation dependency (CLAUDE.md §7). The cycle duration comes from the shared `motif` tokens (four bars, 2.4s cycle, staggered entrance every ~0.4s, hold ~1.2s, synchronized drop-away ~0.3s), so timing stays in one place.

**Tailoring flow screens (Milestone 8, mobile):** the full core loop is built as a root native stack pushed over the tabs (`AppNavigator`) — JD input → staged progress (retrieve) → retrieval checkpoint → staged progress (generate) → result → customize layout → export — entered from Home's start CTA. Each screen owns its header + ambient background (`headerShown:false`); the two staged-progress screens poll `GET /resumes/jobs/:id` and advance on stage (retrieve→checkpoint at `awaiting_confirmation`, generate→result at `done`). Stage→step mapping and the match-score banding are pure helpers in `lib/tailoring.ts` (unit-tested). Two design↔contract items were resolved while building (CLAUDE.md §8):
- **Result → export path:** the finished-job status needed the resume id to reach the result/export screens → added `resumeId` to `JobStatusView` (small, well-scoped facade+contract addition; see the status endpoint above).
- **Customize-layout section set — FLAGGED for the owner:** the design (`tailor_screen_layout_customize.svg`) mocks *five* reorderable rows (Summary, Experience, Projects, Education, Skills), but the rendered-resume content model + the layout contract (`RESUME_SECTIONS`) only have *three* first-class sections — `summary`, `skills`, `experience` (projects/education collapse into experience bullets; there is no separate education block in `renderedContent`). The screen binds to the real three (building non-functional UI for sections the backend can't reorder/hide would be worse), and the one-/two-column toggle maps to the template's layout family (two-column → `modern`; one-column → a single-column template), since `template.layout` is exactly that distinction. **Open decision:** whether the content model should grow first-class projects/education sections, or the design should be trimmed to the three the pipeline produces.

**Resumes + Profile tabs (Milestone 8, mobile — final screen group):** the last two placeholder tabs are built to spec. Each tab is now its own native stack (mirroring `BankStack`), headers hidden so screens own their header + ambient background.
- **Resumes tab** (`ResumesStack`: list → detail). The **list** (`tailor_screen_resumes_list.svg`) reads `GET /resumes`, rendering tilted white history cards (role, "company · template name", relative time, compact match ring); the header "+" and the FAB both open the JD-input flow on the root stack; empty history shows the dog-eared-page motif. The **detail** (`tailor_screen_resume_detail.svg`) reads `GET /resumes/:id`: the tailored bullets, the per-bullet source trace (`from: …`), Edit-layout / Export (which push the existing full-screen root-stack flow screens) and a destructive Delete (`DELETE /resumes/:id`).
  - **Resume-detail EXPERIENCE / PROJECTS split (design↔contract, resolved):** the design groups bullets under EXPERIENCE and PROJECTS headings, but `renderedContent.bullets` is a flat list with no per-bullet section. Rather than fabricate a split, the grouping is *derived from real data* — each bullet's `experienceItemId` is resolved against the bank (`GET /bank`) and grouped by the **source item's type** (role → EXPERIENCE, project → PROJECTS, education → EDUCATION; unresolved sources fold into EXPERIENCE). This honestly reproduces the design's headings while staying within the same three-section content model flagged above (`lib/resume.groupResumeBullets`, unit-tested).
- **Profile tab** (`ProfileStack`: settings → sub-screens). **Settings** (`tailor_screen_profile_settings.svg`): avatar initials + name (from Resume basics) + email (from `GET /account`), the settings rows, **Log out** (clears the session) and **Delete account** (`DELETE /account`, then clears the session). **Resume basics** (`tailor_screen_resume_basics.svg`): the contact/summary form, `GET`/`PUT /bank/basics`, backend field errors surfaced per-field. **How this works** (`tailor_screen_how_this_works.svg`): a static explainer of the parse→retrieve→generate pipeline with an illustrative match dial.
  - **Undesigned Profile rows — partially resolved, still FLAGGED for the owner:** four settings rows have no finalized design SVG. **Account details** (`GET /account` — read-only: email, verification status, member-since) and **Password** (`PATCH /account/password` — change form) are now *built functionally on the established design system* (same header/tokens/TextField/Button; no bespoke layout) rather than left as placeholders, since both back onto real, already-built routes. **Notifications** (documented Phase-2 placeholder, §5) and **Legal and privacy** (no route or design yet) remain the shared `ProfilePlaceholderScreen`. **Open decision:** finalized designs for all four (the two built ones can be restyled without touching behavior), and whether Legal/privacy needs real content.
  - **Password change signs out *all* devices — FLAGGED (design↔impl):** build brief §5 says `PATCH /account/password` "revokes other sessions," but `authModule.changePassword` revokes *every* refresh token (including the caller's). The mobile Password screen is honest about this — it warns up front and, on success, shows a "signed out everywhere → sign in again" screen that clears the local session, instead of letting the current session die on its next token refresh. **Open decision:** either narrow the backend to revoke only *other* sessions (keeping the current device signed in) and update this screen, or keep sign-out-everywhere and update §5's wording.
- **New pure helpers:** `lib/resume.ts` (`resumeListSubtitle`, `initialsFromName`, `groupResumeBullets`, `indexBankItems`) with `lib/resume.test.ts` (ADR-019). **New API wrappers:** `api/account.ts` (`getAccount`, `deleteAccount`), `deleteResume` (`api/resumes.ts`), `updateResumeBasics` (`api/bank.ts`). **New shared UI:** `components/MatchRing.tsx` (the sizeable match-score ring used by the list card, the detail header, and the how-this-works dial). The two old placeholder screens (`ResumesScreen`, `ProfileScreen`) and the now-unused `ComingSoon` component were removed.

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

# File storage — rendered resume exports. If the R2_* set is incomplete, exports
# fall back to local disk (FILE_STORE_DIR) so the pipeline runs keyless.
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
FILE_STORE_DIR=.tailor-files          # local-disk export fallback (only when R2 unset)

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

- ~~Which specific layout *variants* each of the 3 templates gets isn't designed yet — needed before milestone 7.~~ **(Decided — Milestone 7.)** Phase 1 ships a deliberately minimal, honest variant set rather than an invented catalog: `modern` gets **sidebar left / sidebar right** (the one genuinely meaningful choice a two-column template has), and the single-column templates (`ats`, `compact`) get **one canonical variant each**. Defined in `shared-types` (`LAYOUT_VARIANTS`, `DEFAULT_LAYOUT_VARIANT`, `isValidLayoutVariant`). **Follow-up (not blocking):** richer per-template variants (e.g. accent/heading styling toggles for the single-column templates) are a later design pass — flagged so the small starting set isn't mistaken for the final catalog.
- Observability specifics (which logging library, whether a real dashboard tool like Axiom/Better Stack is worth it vs. Render/Railway's built-in log viewer) — low priority, deferred to deploy time (milestone 9), no pressure since the project isn't going live imminently.
- Profile & settings screen's account actions (change password, delete account) now have routes specified (Section 5) but haven't been built or wired into a milestone explicitly — fold into milestone 2 (auth module) rather than treating as a separate pass. **(Done — Milestone 2 slice 2.)**
- **Google sign-in (`POST /api/auth/google`) — deferred, to integrate 2026-07-25 (Milestone 2, slice 2b).** Everything else in Milestone 2's auth module is built and tested (slices 1 + 2 on branch `feature/auth-module`). Google is the only remaining auth piece. Prerequisite the owner must set up first: a **Firebase project** (free) with Google sign-in enabled + a service-account key → fills `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` (already in `.env.example`). Plan: build the backend route with token verification behind an `IdTokenVerifier` interface (firebase-admin impl) so the facade/route are testable with a fake verifier and CI stays green without real credentials; owner wires the real project when ready. Mobile client config is a separate, later (Milestone 8) concern.
