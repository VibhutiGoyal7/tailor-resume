# Tailor (formerly "AI Resume & Career Copilot") — Project Document

**Status:** Architecture decisions locked (ADR-001–018); PRD drafted and revised (see companion `resume-copilot-prd.md`); full information architecture defined, and all ~25 screens taken to full high-fidelity visual design (Section 9), in the locked dusty-denim-blue system (Section 9b). Product name and app icon finalized (**Tailor**). See "Current State at a Glance" below for a quick-reference snapshot.
**Owner:** Vibhuti Goyal — Senior Mobile Developer (Flutter/React Native/Kotlin), ~3 years experience. Genuinely new to backend/web development and to end-to-end personal-project ownership generally — this is their first personal project of this kind (see Section 1 and the ADR-010 recalibration note).
**Documentation ownership (Session 5):** as of this note, **Claude Code is the sole owner of these docs going forward** — this chat's exports were the seed/handoff, not an ongoing sync source. Claude Code should update these files directly as decisions are made during the build, per `CLAUDE.md` Section 6, rather than this project doc being periodically re-exported from a separate chat. If this project is ever picked back up in a fresh chat outside Claude Code, treat whatever's in the actual repo as current truth over any older copy.
**Last updated:** July 2026 (fourth working session — see Section 8 for what changed since earlier sessions)

---

## Current State at a Glance

*(This table is the single source of truth for "what's decided right now." It gets overwritten in place each session — it is not a log. For the reasoning behind any of these, or how we got here, see the relevant ADR or Section 8's session history.)*

| Area | Current answer |
|---|---|
| Product name | **Tailor** |
| Mobile stack | **React Native** (Expo) |
| Backend stack | **Next.js** (API routes) + separate plain-Node worker process |
| Database | PostgreSQL + pgvector, via Prisma |
| Accent color | **Dusty denim blue `#2F4858`** (tangerine and burnt terracotta are both superseded — ignore any earlier mention of either) |
| Auth | Self-rolled JWT (email/password) + Firebase for Google OAuth handshake only (ADR-010) |
| Templates | 3 — Clean/ATS-safe, Modern two-column, Compact/dense (ADR-018) |
| Screens designed | All 25 (Home + 24), full visual design, dusty-denim system |
| Build brief | Exists — `tailor-build-brief.md` |
| Build progress | **Milestone 6 (resume-engine: generate + render/export) built; on branch `feature/resume-engine-generate`, not yet merged.** M1–M5 merged to `dev` (`main` tagged `v0.1-milestone4-parse`). **M6 (this session):** (a) **generate** — `POST /jobs/:jobId/confirm` advances `awaiting_confirmation → generating` and enqueues `generateResume` (the *only* place generate is enqueued — ADR-017); `runGenerateStage` calls Claude **Sonnet** (ADR-004, `claude-sonnet-5`, structured output) to select/rewrite the kept bullets, **reconciles grounding** (drops hallucinated `sourceBulletId`s, attaches real `experienceItemId` traces, dedupes, caps at 12), and advances `generating → done`. (b) **render + export** — the same stage renders **PDF** (`@react-pdf/renderer`) + **DOCX** (`docx`) for **3 templates** (`ats`/`modern`/`compact`, ADR-018) and stores them via a `FileStore`; `templateId` is auto-suggested from `company_type` at parse time (`suggestTemplateId`, ADR-012 — retires the `"classic"` placeholder). New routes `GET /resumes/:id` (detail + `availableFormats`) and `GET /resumes/:id/export?format=pdf|docx` (streams the file). **All keyless:** generator stubs when no `ANTHROPIC_API_KEY`; `FileStore` = local disk when no `R2_*`; renderer is worker-injected so `web` never imports render deps (CLAUDE.md §7). **ADR-012 amended** (docx lib, storage, React-18 pin — see ADR-012). Google sign-in still deferred (slice 2b). **M7 next:** template-picker/layout customization (`updateResumeLayout`) + resume history list/delete. Lint/format/**repo-wide typecheck**/test green (158 tests; DB+pgvector via `RUN_DB_TESTS=1`) + live keyless smoke: real PDF (v1.3) + DOCX (Word 2007+) files verified for all 3 templates. |
| Repo tooling | npm workspaces · TypeScript · Vitest · ESLint 9 (flat) + Prettier · tsx (worker dev) — see Section 5 |
| Deploy status | Not live; not deploying imminently (owner's explicit call, Session 4) |

---

## 0. How to use this document

This file is meant to be **self-contained context**. If you're picking this project back up — in a new chat, a new account, months later, whatever — share this whole document with Claude and it will understand exactly where the project stands, what's been decided, why, and what's still open. Section 8 ("Conversation Context") specifically exists for that purpose; read it first if you're re-orienting.

---

## 1. Personal Context & Why This Project Exists

This is being built for two reasons, and both should shape every decision in this doc:

1. **Portfolio/resume project** — this will be a public git repo referenced on the owner's resume, potentially used in interviews while job-switching.
2. **Deliberate skill-building** — the owner is a strong, experienced mobile developer (Flutter, React Native, native Android/Kotlin) with real AI integration experience (prompt engineering, OpenAI/Replicate/Vertex APIs, on-device TensorFlow Lite CV) already reflected on their resume. What's *missing* from their profile is end-to-end backend ownership and system design — they've touched backend logic inside other people's systems, never owned the architecture.

**The explicit positioning goal:** not to be typecast as "just a mobile developer" — the owner wants to present as someone who can operate as a **business analyst + architect**, not only an implementer. This means the project's requirements docs, trade-off reasoning, and architecture decision records are as much a portfolio artifact as the working code — arguably more important for this specific positioning goal.

**Working method:** the owner is building this primarily via Claude Code, giving it instructions throughout the day, with ~5-7 hours/day of availability for review/direction (not necessarily hands-on-keyboard the whole time — Claude Code can work somewhat continuously while they check in). Given this, the real bottleneck is decision-making and understanding, not raw implementation speed. **The owner explicitly does not want simplified/beginner-tier decisions made on their behalf just because they're newer to backend — they want the best real answer and are willing to put in the time to learn it.**

Priority balance requested: steady progress with real depth (not "ship fast" and not "learn forever," a balance).

---

## 2. Product Vision

An app that helps people build resumes genuinely tailored to a specific job — not templating, but understanding both the person (via structured data *and* free-form reflection) and the job description, then producing a resume that emphasizes the right things in the right format.

Longer-term vision: extend from "help me apply" to "help me get the job" — job discovery, application tracking, and interview prep (see Phase 3, redesigned from the original concept — see ADR-005).

---

## 3. Phased Roadmap (current, post-discussion)

### Phase 1 — MVP: Resume Tailoring Engine (the core differentiator, build this first and make it excellent)
- User profile + structured experience bank (source of truth — see ADR-002)
- Free-form elaboration → LLM extraction → bullet suggestion/accept/edit/reject flow
- JD-aware tailoring via a real RAG pipeline (see ADR-003, ADR-004) — not simple templating
- Multi-format resume rendering (3-4 templates), auto-suggested by JD/company type
- Export to PDF/DOCX
- Deploy live from week one (not "deploy at the end")

### Phase 2 — Job Discovery & Application Tracking
- Job ingestion via **official APIs first** (Greenhouse, Lever, Ashby job board APIs; Adzuna, USAJobs, RemoteOK, etc.)
- Career-page scraping only as a fallback, respecting robots.txt
- **No LinkedIn scraping** — legal/ToS risk too high for this project (see ADR-006)
- Application tracker (status per job)
- "Auto-fill and review" applications — not silent full automation (see ADR-007)

### Phase 3 — Interview Prep & Coaching (redesigned — now much more buildable, pull forward if time allows)
- **Original idea (background/live interview recording) rejected** — legal risk (all-party consent recording laws) with no clean mitigation for a personal project
- **Current design: user uploads a recording file they already have** (not live/background capture). This shifts legal responsibility for lawful recording to the user, the same pattern used by tools like Otter.ai/Gong/Grain. Requires a simple disclaimer ("only upload recordings you had the right to make").
- Pipeline: transcript → strengths/weaknesses analysis → personalized improvement/prep plan
- Because this is now "process an uploaded file" rather than "manage a live recording session," it's a meaningfully smaller lift than originally scoped — worth reconsidering its phase placement once Phase 1 is solid.

---

## 4. Architecture Decisions (ADR-style log)

This is the section to lean on hardest in interviews — it's the actual evidence of architect-level reasoning, independent of the code.

### ADR-001: Modular Monolith + separate worker process (not microservices)
**Decision:** One codebase, two deployables — an API service (handles requests, auth, enqueues async work) and a worker process (consumes a job queue for LLM calls, embedding generation, PDF rendering, job ingestion polling). Inside the API service, organize by module (`profile`, `resume-engine`, `job-ingestion`, `applications`) with a hard rule: **modules only communicate through explicit exported interfaces/function calls, never by directly querying another module's database tables.**

**Why:** Microservices solve an organizational scaling problem (independent teams shipping independently) at the cost of real complexity (network calls replacing function calls, distributed transactions, multi-service debugging/observability). A solo dev on a personal project has none of the organizational problem, so paying that cost has no matching benefit. The API/worker split is a genuine architectural boundary (sync request/response vs. long-running async work), not an arbitrary domain split — and the module discipline inside the monolith means a future split into real services is cheap (swap a function call for a network call) if a real scaling trigger ever shows up.

**Explicit triggers that would justify splitting a module into a real service later:** job ingestion getting real independent load (different traffic pattern + different failure blast radius than the rest of the app — most likely first candidate); opening the API to third-party clients; a specific module needing independent scaling under real traffic. None of these exist yet for a personal project.

### ADR-002: Experience Bank as source of truth; resumes are derived, versioned artifacts
**Decision:** The user's raw structured experience data (`ExperienceItem` / `ExperienceBullet`) is never edited directly through a rendered resume. Every tailored resume (`TailoredResume`) is a versioned artifact generated *from* the experience bank for a specific JD.

**Why:** Same pattern as content/presentation separation in a CMS, or normalized data vs. a materialized view. Fixing a typo in real work history should propagate to future tailored resumes automatically rather than requiring edits across N divergent copies. It also makes tailoring a conceptually pure function — `tailor(experience_bank, jd) → resume` — which is testable, cacheable, and easy to explain.

### ADR-003: Retrieval approach — embeddings (Voyage AI + pgvector) with hybrid semantic + tag re-ranking
**Decision:** Each `ExperienceBullet` gets a stored embedding (via Voyage AI, using pgvector on the existing Postgres instance — no separate vector DB). Retrieval combines semantic similarity search with a symbolic boost from the `tags` field (exact skill-tag matches rank above pure-semantic neighbors).

**Why (and the rejected alternative):** The simpler alternative was keyword/tag-only matching — cheap and deterministic, but brittle (won't match "ML" to "machine learning" to "TensorFlow" without perfect tagging discipline). Embedding-based retrieval is a genuinely more sophisticated, valuable pattern (RAG-style retrieval) and pgvector means it's a small addition on top of infrastructure already in place, not a new system to run. This was an explicit, deliberate choice to build real RAG experience as part of this project's learning goals, not just call an LLM directly.

**Embedding provider:** Voyage AI (Anthropic's recommended embeddings partner — Claude itself doesn't generate embeddings). Abstracted behind the app's own service layer so the provider could be swapped later without touching the rest of the system.

### ADR-004: Three-stage pipeline — parse → retrieve → generate (not one big prompt)
**Decision:**
1. **Parse:** raw JD → LLM call → structured JSON (`required_skills`, `nice_to_have_skills`, `role_type`, `seniority`, `company_type`, `key_responsibilities`). This structured JD is what drives both retrieval and template selection.
2. **Retrieve:** embed each `key_responsibility` and `required_skill` *separately* (not the whole JD as one blended vector — finer-grained queries retrieve more precisely), pull top-k similar bullets per query via pgvector cosine similarity, union/dedupe into a candidate pool, apply the ADR-003 hybrid re-ranking.
3. **Generate:** feed the LLM the structured JD + the retrieved candidate pool (not the entire experience bank — keeps prompts small and cheap) + template constraints. Ask for structured output (JSON/tool-use, not free text) selecting a subset, rewriting phrasing to mirror the JD's language, and referencing which source bullet each output line derived from (this "grounding reference" is a structural guardrail against the LLM inventing facts).

**Why:** Keeping these as distinct, independently testable stages (rather than one big prompt trying to do everything) is itself a sound engineering decision worth being able to explain — it's easier to debug, cache, and reason about failure modes stage by stage.

### ADR-005: Interview analysis — upload-based, not live background recording
**Decision:** See Phase 3 above. User uploads a recording they already have; the app never listens in the background.

**Why:** Many jurisdictions require all-party consent to record a conversation; a background-recording feature would put legal exposure on the user (not just the app) for recording an interviewer without their knowledge. Upload-based processing shifts responsibility for lawful recording to the user — the same pattern established products (Otter.ai, Gong, Grain) use — and is a smaller, cleaner engineering scope besides.

### ADR-006: Job data sourcing — official APIs first, scraping as fallback only, no LinkedIn
**Decision:** Prioritize Greenhouse/Lever/Ashby job board APIs and aggregator APIs (Adzuna, USAJobs, RemoteOK). Career-page scraping only as a fallback, respecting robots.txt. LinkedIn scraping excluded entirely.

**Why:** LinkedIn actively pursues scrapers legally and technically (see *hiQ Labs v. LinkedIn*), not worth the risk for a personal project. Career-page scraping is comparatively low-risk (public, no login) but operationally fragile (every page has a different structure) and doesn't teach durable backend skills — so it's deliberately scoped as a fallback, not the primary path.

### ADR-007: Application automation — auto-fill + human review, not silent auto-apply
**Decision:** The system pre-fills an application using the tailored resume; the user reviews and submits.

**Why:** Many job boards' ToS prohibit fully automated submission, and quality/detection risk (generic answers to screening questions) is real. This can be revisited once the core product is validated.

### ADR-008: Module contracts — one public facade per module, no cross-module DB access, one-directional dependency graph
**Decision:** Each module (`profile`, `resume-engine`, `job-ingestion`, `applications`) exposes exactly one public entry point (a facade/service interface). No module ever imports another module's repository, DB models, or internal types directly — cross-module access only happens through the facade's exported methods (the module's "contract"). Dependencies flow one direction only, no cycles:

```
profile  ←──────────┐
   ↑                 │
   │                 │
resume-engine    job-ingestion
   ↑                 ↑
   │                 │
   └── applications ──┘
```
`profile` and `job-ingestion` depend on nothing else. `resume-engine` depends on `profile`. `applications` depends on all three (it's the module that ties a user, resume, and job listing together).

Contract methods must honestly reflect sync vs. async work — e.g. `resumeEngine.requestTailoredResume()` returns a `{ jobId }` handle immediately rather than pretending to return a finished resume synchronously, since the actual work (LLM calls) takes several seconds. This mirrors ADR-001's monolith-with-real-boundaries approach: the discipline of never reaching into another module's data directly is exactly what makes a future extraction into a real microservice cheap, if one of the explicit triggers in ADR-001 is ever hit.

**Cross-module communication style:** direct calls by default (traceable, simple — a stack trace shows exactly what happened). Exception: `applications` status-change events (e.g. status → "interview scheduled") are published on an in-process event bus rather than called directly, because this is the one place a future module (Phase 3 interview-prep) will plausibly need to react without `applications` being modified to know about it. Using an event bus everywhere "just in case" was explicitly rejected as over-engineering for this project's size — it trades away the traceability of direct calls for a decoupling benefit not needed elsewhere yet.

---

### ADR-009: Queue task granularity — staged tasks (parse → retrieve → generate), not one monolithic task
**Decision:** The resume tailoring pipeline is broken into three separate, chained queue tasks — "parse JD," which on success enqueues "retrieve candidates," which on success enqueues "generate resume" — rather than one single "tailor this resume" task that runs all three stages inline.

**Why (and the rejected alternative):** The simpler alternative — one task running the whole pipeline — means a failure at the generation stage forces a full retry, redoing the parse and retrieval work (and their LLM/embedding costs) even though those stages already succeeded. Staged tasks mean a failure only retries the stage that actually broke: cheaper, more precise, and a closer match to how production LLM pipelines are typically built in practice. Trade-off accepted: more moving parts to build and monitor (three task types instead of one, with results passed stage to stage) — deliberately chosen given this project's depth-over-speed priority.

---

### ADR-010: Self-rolled JWT authentication, not a managed provider (Clerk)
**Decision:** Auth is built in-house from v1 — no Clerk or other managed auth provider. Specifics:
- Password hashing via **argon2** (never hand-rolled hashing)
- **Access token + refresh token pair**: short-lived access token (~15 min) used on every request; longer-lived refresh token used only to mint new access tokens
- **Refresh token rotation + revocation**: each refresh issues a new refresh token and invalidates the old one; refresh tokens (or their hashes) stored server-side so they can be revoked on logout or suspected compromise
- **Secure token storage on mobile**: platform-secure storage (iOS Keychain / Android Keystore via `flutter_secure_storage` or `expo-secure-store`), not plain AsyncStorage/SharedPreferences
- **Rate limiting on login/signup endpoints: max 7 attempts** (brute-force protection)
- Email verification + password reset via a transactional email provider — **Resend** (solid free tier for personal-project volume)

**Why (and the rejected alternative):** The original plan was Clerk (managed auth) for v1, with hand-rolled JWT deferred as a later, isolated learning exercise — reasoning that auth is easy to get subtly wrong for someone unfamiliar with the space, and Clerk removes that risk. This was revisited once it became clear the owner already has real production JWT exposure at their current job — they understand the concept, they're implementing something already familiar rather than learning from zero, which substantially lowers the risk of getting it wrong. Given the project's explicit priority (real depth over speed, architect-level ownership as a portfolio goal), a self-built auth system is a stronger, ownable story ("I designed the token flow, handled refresh rotation, made deliberate security trade-offs") than "I integrated a managed service" — and the added scope (password hashing, token pair, rotation, secure mobile storage, rate limiting, transactional email) is accepted as worthwhile given the owner's existing familiarity.

**New dependency introduced:** a transactional email provider (Resend) for verification/reset emails — not needed under the Clerk plan, since Clerk handled this internally.

**Addendum (Session 4) — Google login via Firebase, ADR-010 stays intact:** Google sign-in is added as a login option. **Firebase Auth is used only for the Google OAuth handshake** — the mobile app uses Firebase's client SDK to get a Google-verified Firebase ID token, sends that token to our backend, our backend verifies it server-side (via Firebase Admin SDK) and, on success, mints our own access/refresh JWT pair exactly as it does for email/password login. Firebase never issues or owns the session — it's a one-time identity handoff, not a parallel auth system. This preserves the whole point of ADR-010 (owning the token flow end-to-end) while still giving users a one-tap Google option. Email/password and Google sign-in converge on the exact same `RefreshToken`/session model from that point on.

**Recalibration (post-PRD discussion):** on revisiting this decision, the owner's "real production JWT exposure" is more precisely: they understand the access/refresh token flow, secure storage, and expiry behavior from consuming it on the mobile/client side — they have not previously implemented the backend side (token signing, argon2 hashing, rotation, server-side revocation, rate limiting). This is a meaningfully different risk profile than the original ADR assumed. The decision (self-rolled auth) still stands, but the reasoning changes: auth is being deliberately chosen as a well-scoped, well-documented **first real backend security implementation** — the owner already has the conceptual scaffolding to recognize correct behavior (lowering the risk of an undetected subtle bug), which is precisely the kind of end-to-end backend ownership gap this project exists to close (Section 1). Practical consequence: the learning notes doc's auth section should cover implementation-level detail (why argon2 over bcrypt, what rotation looks like in code, what a revocation store actually is), not just the conceptual explainer it might otherwise be, and the build brief should treat this module as warranting extra step-by-step scaffolding rather than routine treatment.

---

### ADR-011: REST for mobile↔backend API, with BFF-style aggregate endpoints for multi-module screens
**Decision:** The mobile app talks to the backend over REST, not GraphQL. Routes map closely to the module facades from ADR-008 (one route group per module: `/profile`, `/resumes`, `/jobs`, `/applications`). For screens needing data stitched from multiple modules (e.g. application detail needs the application, resume, and job listing), a small number of purpose-built aggregate endpoints (e.g. `GET /applications/:id/detail`) compose the data server-side rather than requiring the mobile client to make and merge several calls — a lightweight "backend for frontend" pattern rather than full GraphQL.

Async operations expose the same reality as their underlying module contracts — e.g. `POST /resumes` returns `{ jobId }` immediately (matching `resumeEngine.requestTailoredResume()`), with `GET /resumes/jobs/:jobId` for polling status.

**Why (and the rejected alternative):** GraphQL was seriously considered, since the module design means several mobile screens need data combined across modules — exactly the problem GraphQL is built to solve elegantly (client-specified queries, no over/under-fetching, one round trip). It was ultimately not chosen because it represents a genuinely larger new-concept learning curve (schema definition, resolvers, a different request model) compared to REST, which the owner already has real working familiarity with from consuming other APIs — unlike the other "take the deeper option" decisions in this doc (RAG, staged queue, self-rolled auth), where the owner had either direct relevant experience or the depth was core to the project's differentiation. The BFF-style aggregate-endpoint pattern captures most of GraphQL's practical benefit (avoiding client-side stitching) for the handful of screens that actually need it, without taking on the full GraphQL investment.

---

### ADR-012: Template rendering — React-PDF for PDF, separate docx templating library for Word export
**Decision:** Resume PDFs are generated with `@react-pdf/renderer` (templates built as React components), not a headless-browser HTML/CSS-to-PDF approach. DOCX export uses a separate, dedicated docx templating library (e.g. `docxtemplater`) rather than forcing one tool to handle both formats. Rendering runs in the worker process (ADR-001), not the API service. Template auto-suggestion is simple rule-based mapping from `jd_parsed.company_type` (produced during JD parsing, ADR-004) to a `templateId`, with user override — deliberately not an LLM call.

**Why (and the rejected alternative):** A headless-browser approach (Puppeteer/Playwright rendering HTML/CSS to PDF) was considered — maximally flexible and a common production pattern, but a real resource risk given the project's committed free-tier hosting (ADR/costing section — Render free tier has limited memory, and a full Chromium instance is heavy). React-PDF is lighter-weight and better suited to constrained hosting, and its component-based model directly matches the owner's existing React/React Native mental model, making it a natural fit rather than a new paradigm. Template selection was deliberately kept rule-based rather than LLM-driven — simple mapping logic doesn't need the cost/latency of a model call.

### ADR-013: CI/CD — GitHub Actions, PR checks + deploy on merge to main
**Decision:** Two GitHub Actions workflows: (1) on every pull request — lint, run tests, Docker build check; (2) on merge to `main` — build and push the Docker image, trigger deploy to the chosen host (Render/Railway). Repo is public (supports the portfolio goal and keeps GitHub Actions free).

**Why:** Standard, low-effort CI/CD that matches the free-tier hosting plan and gives a visible, portfolio-relevant pipeline without over-engineering (no separate staging environment, no blue-green deploys — not warranted at this scale).

### ADR-014: Signup/verification gating — before Parse, not mid-flow or post-generation
**Decision:** A user must sign up and verify their email before submitting a JD at all — i.e. before the Parse stage of the tailoring pipeline (ADR-004) runs. There is no anonymous/guest pipeline execution of any kind.

**Why (and the rejected alternatives):** Three gating points were considered against where the pipeline's real cost sits: **gate before Parse** (cheapest, simplest, but weakest "let them see the product first" story), **gate before Generate** (lets an anonymous user see a real match-score preview from Parse+Retrieve before being asked to sign up — a strong "show, then ask" moment, but requires a guest-identity/session concept to hold in-progress state across the signup step), and **gate after Generate, before Export** (most generous, but reopens the exact abuse-prevention problem gating exists to solve, since it lets anonymous traffic trigger the costliest LLM call repeatedly). Gate-before-Generate was the initial preference, but was deliberately walked back to gate-before-Parse once weighed against the fact that this project is not live/public yet — the guest-session complexity that option requires has no one to benefit from it right now, and is trivial to revisit later since Parse/Retrieve/Generate are already cleanly separated stages regardless of where the gate sits. Simpler now, easy to move later.

### ADR-015: Tailoring progress UI — stage-aware, not a single generic spinner/retry
**Decision:** The tailoring flow's UI surfaces the three pipeline stages (Parsing, Retrieving, Generating — ADR-004) explicitly and individually, each with its own visual state (pending / in-progress / success / failed). On failure, only the failed stage shows an error and retry action; already-succeeded stages remain visibly marked done. Retrying only re-triggers the failed stage's queue task (ADR-009) — it does not restart the pipeline from Parse.

**Why (and the rejected alternative):** The simpler alternative — one generic "Retry" button that quietly resumes from the correct stage underneath — is functionally just as correct (ADR-009 already makes stage-level retry cheap on the backend) and cheaper to build (one error state instead of four stage states to design). It was rejected because this project's explicit purpose is to *demonstrate* system design and UX thinking (Section 1's BA/architect positioning goal), not just have it work invisibly — a generic spinner hides the exact staged-pipeline architecture that ADR-009 was built to make possible. This directly reuses the staged-progress design already committed to in Section 9b ("Reading the job description" → "Finding your best-fit experience" → "Writing it in their language"), extending it to also represent failure/retry per stage rather than only forward progress. Consequence for the API: the polling endpoint (`GET /resumes/jobs/:jobId`, ADR-011) must return stage-level status, not just an overall job status — flagged here for the build brief.

### ADR-016: Onboarding — a guided single-item quick-add, not an empty app after first-run choice
**Decision:** Choosing "start from scratch" at first-run no longer drops the user into an empty app to independently discover the Bank tab. It leads directly into one guided quick-add screen (title/company + a free-form "what did you do" box, routing through the existing bullet-extraction flow), followed by a "you're ready" screen offering either "tailor a resume now" or "add more to your bank first" as an explicit choice. Skipping this step remains possible.

**Why (and what it fixes):** Walking through the app end-to-end from a real first-time user's perspective (not the designer's) surfaced a genuine time-to-value problem: "start from scratch" gated the entire core value of the product (a tailored resume) behind an open-ended, tedious setup task, with no minimum-viable-bank concept and no fast path — someone tailoring a resume for a job posting closing tomorrow would plausibly bounce here. This decision doesn't lower the bar on what the experience bank needs to become over time; it just gets the user to their first tailored resume with the minimum real content needed, and is honest that quality improves as more is added, rather than implying full completeness is required before the core feature can be tried at all.

### ADR-017: A retrieval checkpoint screen between Retrieve and Generate, not a silent handoff
**Decision:** A new screen — "Here's what we found" — sits between the Retrieving and Generating stages of the tailoring pipeline (ADR-004). It shows which experience items were matched as relevant, lets the user uncheck anything wrong before Generate runs, and requires explicit confirmation ("looks good, continue") to proceed. Previously, retrieval was entirely invisible until the final result, where a bad match could only be corrected by editing the bank and re-running the entire pipeline.

**Why:** The same end-to-end walkthrough surfaced that a wrong retrieval decision was expensive to correct under the original design — the user's only lever was a full re-run, discovered only after paying for the Generate call. Surfacing retrieval as an explicit, correctable checkpoint catches this before the costliest stage runs, and makes the RAG pipeline's intermediate reasoning visible rather than opaque — consistent with the project's broader "make the architecture demonstrable, not just functional" principle (see ADR-015's reasoning, which this extends).

**Consequence for the API (flagged for the build brief):** this changes the async contract from a single fire-and-poll interaction into a two-phase one — the client must receive the retrieved candidate set and wait for explicit confirmation before the Generate stage's queue task is enqueued, rather than all three stages running back-to-back once triggered.

### ADR-019: Testing strategy — standard per-module discipline, not a showcase layer
**Decision:** Testing is treated as an ordinary engineering discipline maintained per-module as the project is built — unit tests for module facades and pipeline tasks, integration tests for API routes, and CI running lint + tests on every PR (already scoped in the build brief's milestone 1) — rather than a separate, elaborate testing showcase.

**Why:** Deliberately kept simple and standard rather than over-engineered — the goal is a real, demonstrable pipeline, not a showcase of unnecessary complexity. Test-writing is treated as a discipline to maintain per-module as the project is built, not an afterthought bolted on later, since it's far cheaper to build that habit early than retrofit it.

## 9. Mobile App Screens — Information Architecture (finalized IA, wireframe-complete)

**App shell:** bottom navigation, 4 tabs — **Home**, **Bank**, **Resumes**, **Profile** — sitting on top of an auth stack that exists outside the nav entirely.

**Auth stack (pre-nav, 7 screens):** Welcome → Sign up / Log in → Verify email (the actual ADR-014 gate — nothing past this works unverified) → Forgot password → Reset password → **First-run choice** (shown once after first login: "Upload an existing resume" or "Start from scratch" — see ADR-016 for why "start from scratch" is no longer a dead end).

**Home tab:** dashboard — primary "tailor a new resume" action, recent resumes preview, empty-state prompt if the bank's empty.

**Bank tab (10 screens):** Bank list (grouped by type: roles/projects/education/skills) → Add-entry method choice (Add manually / Write about it / Import from resume) → the 4 per-type manual forms (Role, Project, Education, Skill) → Write-about-it free-form input → Import-from-resume upload + staged parsing → Bullet review (accept/edit/reject, nothing saves silently) → Item detail/edit.

**Resumes tab + tailoring flow (9 screens):** Resume history → Resume detail (rename, download PDF/DOCX, duplicate, delete, view-source-per-bullet) → JD input (with a sparse-bank nudge banner, non-blocking) → Staged progress (Parsing/Retrieving/Generating, each stage individually stateful per ADR-015, including the failed-stage-with-retry state) → **Retrieved matches** (the new ADR-017 checkpoint — review/uncheck matched items before Generate runs) → Result & template (match score, per-bullet source trace, template picker, now also showing a Resume-basics contact-info chip with a direct edit link) → Layout customization (section reorder, show/hide, layout variant picker) → Export.

**Profile tab (3 screens):** Profile & settings (account, password, notifications, legal, delete account) → **Resume basics** (full name, phone, location, links, summary — the personal-info entity that was missing until the end-to-end walkthrough surfaced the gap) → **How this works** (a short, optional explainer of the match-score/source-tracing idea for first-time users).

**Design status: complete.** All ~25 screens above have been taken to full high-fidelity visual design (fields, layout, sequencing, and final visuals — Section 9b). An end-to-end walkthrough from a first-time user's perspective (not the designer's) was done against the earlier wireframes and surfaced two real gaps, which are now reflected directly in the flow above: a dead-end "start from scratch" path with no time-to-value (fixed by ADR-016) and an invisible, uncorrectable retrieval step (fixed by ADR-017). Two smaller fixes also came out of that walkthrough: the sparse-bank nudge on JD input, and the visible Resume-basics contact-info chip on the Result screen.

---

## 9b. Design System (visual direction — revised, superseding the original indigo-based system)

**Status of this revision:** the original indigo/grayscale system below was reconsidered after the owner explicitly pushed back that a restrained, no-shadow, minimal-illustration system read as "sits there like a formal office app" — not the feeling wanted for a product meant to make an inherently stressful process (job hunting) feel less hectic. The core semantic rule (accent color reserved for moments the AI/RAG pipeline made a decision) is preserved; the execution around it — palette, shape language, and the presence of illustration — changed substantially.

**Palette (current — see full history below):** light, off-white base (not pure white — a warm-neutral-adjacent light background) with dark ink text, and **dusty denim blue (`#2F4858`) as the single accent color**, reserved exclusively for: the primary CTA, match-score badges/dials, and other moments where the RAG pipeline actually produced a result. Everything else (chrome, cards, nav) stays neutral. This preserves the original system's core discipline — one scarce, meaningful accent color rather than a colorful UI everywhere. *(This superseded both the original indigo and an intermediate tangerine/burnt-terracotta phase — see "How the color evolved" below for the full trail; treat this paragraph, not the history below it, as current truth.)*

**How the color evolved (history — for the reasoning trail, not the current answer):** the original indigo choice was explicitly reconsidered — first ruled off blue-family colors entirely, then explored purely cool options (deep teal-forest, dusty denim, twilight indigo, deep cyan-slate — muted and dark), then reopened to the full spectrum once the owner clarified the actual constraint was never "must be cool," it was "must not read as an app made only for women, and must not look corporate" — a little warmth or a little feminine-adjacent color was explicitly fine, just not exclusively so. Muted/earthy options (burnt terracotta, dark mustard, deep olive) were tested against this and worked, but felt closer to "safe" than "alive." The owner then asked for brighter, more energetic versions of the same non-corporate, gender-neutral logic, landing on **tangerine (`#E2611E`)** over a cool bright alternative (periwinkle). This was later toned down to **burnt terracotta (`#A6420F`)** for feeling too bright at full-app scale. Both were ultimately superseded once the owner reflected that cooler tones read more professional for a resume tool specifically, and once the illustration system carried enough personality on its own that blue was no longer off the table — landing on **dusty denim blue (`#2F4858`)**, the current and firmer answer (see the palette paragraph above).

**Shape language — organic, not uniform-rounded-rectangle:** the original "small restrained radius everywhere" rule is replaced with **asymmetric corner radii** (e.g. opposite corners sharp vs. rounded, varied per card — like `26px 10px 26px 10px`) and **a wavy/organic silhouette for section dividers and headers** (an irregular curved edge, not a straight horizontal line) instead of hard rectangular blocks. List items (e.g. resume history cards) carry a slight, alternating rotation (1–2 degrees, alternating direction) rather than sitting in a perfectly aligned grid — a deliberate "handmade/scrapbook" quality rather than snapped-to-grid precision. This directly answers the "doesn't feel alive" critique of the original restrained system, while keeping the same underlying instinct (avoid the generic, overly-uniform-rounded look) — the fix for "generic" turned out to be organic irregularity, not more or less rounding uniformly applied.

**Illustration — a small recurring mascot motif, not stock icons:** empty states and key moments use a simple, custom-feeling illustrated character (e.g. a document-shaped face with a simple expression) rather than a generic icon-library glyph. This is the single most direct lever for "personality" identified during design discussion — more than color, more than shape — and should be used deliberately at high-attention moments (empty states, key confirmations), not everywhere, to keep it feeling special rather than decorative clutter.

**Signature UI moment (retained from original system):** a match-score element (dial or badge, depending on context — a full dial as the hero on a job-match screen, a compact circular badge in list contexts like resume history) as the visual expression of the RAG pipeline's output — still the app's ownable visual signature. This is also the app icon concept (see Naming below) — the one visual idea that's unique to what this product actually does.

**Loading and progress states (retained and extended — see ADR-015, ADR-017):** long-running processes use a staged, truthful progress indicator reflecting the actual pipeline stages (ADR-009) — "Reading the job description" → "Finding your best-fit experience" → "Writing it in their language" — extended to failure/retry states per stage (ADR-015), and now also including the retrieval-checkpoint step (ADR-017) as an explicit, correctable stage rather than a silent pass-through.

**Copy tone:** conversational and specific rather than generic UI-label language — e.g. "Your resume's a little empty right now" / "Give it something to work with" / "Where you've sent yourself lately" instead of "No resumes yet" / "Get started" / "Resume history." This is treated as part of the design system, not an afterthought — it's doing real work toward the "personality" goal alongside shape and illustration.

**Accent color — status: dusty denim blue, locked (superseding burnt terracotta).** The color went through several more rounds after burnt terracotta was written up: burnt terracotta (`#A6420F`, warm) was tested against a cooler, more muted blue once the owner reflected that cooler tones read more professional for a resume tool specifically — and once the illustration system below was carrying enough personality on its own, blue was no longer off the table (the earlier "not corporate" concern was about *saturated, bright* blue specifically, not blue as a hue). Landed on **dusty denim blue (`#2F4858`)** — muted and dark, not a bright SaaS blue — as the locked accent going forward. This is a firmer decision than burnt terracotta was; unlike the earlier color, it came after seeing the full illustration system and reduced-radius shape language applied together, not just as an isolated swatch.

**Naming and icon — finalized.** Product name: **Tailor** — chosen over more abstract options (Keyed, Sharpn, and the original craft-metaphor/plain-word shortlists) specifically because it's immediately legible as "shapes your resume to fit," which matters for both the end user and for anyone evaluating this as a portfolio piece at a glance. App icon: a resume/document shape with a compact match-score badge in the corner, rebuilt with the same asymmetric-silhouette, tilted-element shape language as the rest of the app (not a plain uniform squircle, which was an earlier miss — a generic rounded-square icon didn't match the app's own personality rules) — chosen over literal tailoring/sewing metaphors (needle-and-thread, measuring tape) because those didn't visually signal "resume" or "job application" at all; the match-score badge is the one mark that's actually specific to this product, since it only makes sense for an app that produces a match score.

**Visual design status — see Section 9 above.** All 25 screens in the finalized IA are now taken to full high-fidelity visual design, in this system.

**Final visual reference (this session's end state):** background moved to a cool gray-blue, accent moved to dusty denim blue (see above), corner radii were tightened from the earlier blobby 20–28px range to smaller asymmetric values, and the smiley-faced mascot was replaced with a small illustration *system* (below) rather than one repeated character. Ambient organic shapes (soft ellipses, floating dots) run across the full screen, not just one corner — this is now the reference standard for taking the remaining screens to full visual design.

![Tailor logo — icon and wordmark, light and dark lockups](assets/tailor_logo.svg)

![Tailor home screen — finalized visual reference](assets/tailor_home_screen.svg)

*(Both images are in the `assets/` folder alongside this document — keep them together if moving or sharing these files.)*

**Color codes (current, dusty-denim direction):**

| Token | Hex | Use |
|---|---|---|
| Background | `#F1F3F4` | Screen background |
| Ambient shape (light) | `#E4EAEC` / `#EAEFF0` | Decorative background ellipses |
| Ambient dot | `#D6E1E4` / `#DCE5E8` / `#CBD8DC` | Floating decorative dots |
| Card border | `#E4E9EB` | Card/component hairline borders |
| Accent (primary) | `#2F4858` | CTA buttons, active nav, primary icon fill |
| Accent (dark mode variant) | `#5B8AA6` | Same role, on dark surfaces |
| Badge tint | `#DDE6E9` | Match-score badge background |
| Ink (primary text) | `#1D2226` | Headings, primary text |
| Secondary text | `#7B8681` | Muted labels, timestamps |
| Muted icon | `#A9B2B6` | Inactive nav icons |

**Illustration system (replacing the single smiley mascot):**

![Tailor illustration motif system — paper airplane, signature flourish, growing sprout, dog-eared page](assets/tailor_illustration_motifs.svg)

| Motif | Where it's used | Meaning |
|---|---|---|
| Paper airplane | Home CTA, JD input, generate/export success | Sending an application, tailoring in motion |
| Signature flourish | Resume basics, Profile, first-run welcome | This is *your* resume, your own mark |
| Growing sprout | Bank tab empty state, "you're ready" moments | Career growth, building over time |
| Dog-eared page | Generic/neutral empty states | Fallback when no more specific motif applies |
| Building blocks (animated) | The two staged-progress screens (parse/retrieve, generate) | Something is actively being built, not just "loading" — extends the growing-sprout "building" idea into motion (Session 4, replacing an earlier animated flight-loader attempt) |

---

## 5. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Mobile app | **React Native** (decided, Session 4 — Flutter dropped from consideration) | Cross-platform, matches owner's existing production experience |
| Backend API | **Next.js**, API routes only (decided, Session 4) | Owner's choice; API service deployed as a standard long-running Node server (`next start`), **not** Vercel serverless — the separate worker process from ADR-001 still needs a plain Node process regardless of backend framework, since Next.js routes are request/response and can't host a persistent queue consumer |
| Database | PostgreSQL + pgvector extension | Relational fits resume/job data; pgvector avoids a separate vector DB |
| Queue | Redis + BullMQ (Node) or Celery (Python) | Standard, well-understood, matches ADR-001's worker process |
| LLM orchestration | Direct Anthropic API calls, custom thin orchestration layer (deliberately avoiding heavy frameworks like LangChain for portfolio/learning value) | |
| Embeddings | Voyage AI (voyage-4 family) | See ADR-003 |
| PDF rendering | @react-pdf/renderer (component-based, runs in worker process; React 18 — see ADR-012 amendment) | See ADR-012 |
| DOCX rendering | **`docx`** (programmatic, runs in worker; supersedes docxtemplater — ADR-012 amendment) | See ADR-012 |
| File storage | Cloudflare R2 (S3-compatible via `@aws-sdk/client-s3`) behind a `FileStore` interface; local-disk fallback in dev | Generated PDF/DOCX resumes |
| Auth | Self-rolled JWT (argon2 hashing, access+refresh token pair with rotation, rate-limited to 7 attempts) + Resend (transactional email for verification/reset) + **Firebase Auth for Google OAuth handshake only** (backend verifies the Firebase ID token, then issues our own token pair — ADR-010 addendum) | See ADR-010 |
| Infra | Docker Compose locally; Render or Railway for deploy; GitHub Actions for CI/CD | Dockerizing + CI/CD explicitly scheduled as its own milestone, not skipped, for resume value |
| Observability | Basic structured logging + one dashboard | Shows production-mindedness |
| Monorepo tooling | **npm workspaces** (no pnpm/yarn/turborepo) — `apps/*` + `packages/*` (decided, Milestone 1) | Built into npm; no extra tool to justify for a repo this size. `apps/web`, `apps/worker`, `apps/mobile` + `packages/db`, `packages/modules`, `packages/shared-types` |
| Language / build | **TypeScript** throughout; shared `packages/*` consumed as source (Next `transpilePackages`, worker via `tsx`) (decided, Milestone 1) | Single language across web/worker/mobile/shared code |
| Testing | **Vitest** (workspace mode, `vitest run` from root), tests colocated as `*.test.ts` (decided, Milestone 1) | Fast, native ESM/TS, one runner across all packages; satisfies ADR-019 |
| Lint / format | **ESLint 9 flat config** (`typescript-eslint`) + **Prettier**, `no-console` enforced (CLAUDE.md §3) (decided, Milestone 1) | Clean-on-scaffold; CI runs `format:check` + `lint` + `test` on every PR to `dev`/`main` |
| Worker dev runner | **tsx** (`tsx watch`) for the plain-Node worker (decided, Milestone 1) | Runs the TS worker directly in dev without a separate build step |
| JWT library | **jose** (HS256 sign/verify) for access tokens (decided, Milestone 2) | Pure-JS, ESM-native, no native build; "self-rolled JWT" per ADR-010 means our own issue/rotate logic, not our own crypto |
| Request validation | **zod** — schemas in `packages/shared-types`, shared by routes + tests (decided, Milestone 2) | One schema source for validation and inferred TS types |
| Backend logging | **pino** (structured), shared `logger` in `@tailor/modules` (decided, Milestone 2) | ADR/CLAUDE.md Section 3; child loggers carry requestId/jobId. Log-shipping dashboard still deferred to deploy |
| Transactional email | **Resend** behind an `EmailSender` interface; dev/no-key fallback logs links instead of sending (decided, Milestone 2) | Verification + password-reset emails; interface keeps the facade testable with a fake sender |

---

## 6. Core Data Model

```
ExperienceItem
├── id, user_id
├── type: "role" | "project" | "education" | "skill"
├── raw_input: text                      -- what the user actually wrote
├── source: "structured_form" | "freeform_extracted"
├── structured_fields: { title, company, dates, ... }
├── extracted_bullets: ExperienceBullet[]
└── created_at, updated_at

ExperienceBullet
├── id, experience_item_id (parent)
├── text
├── tags: string[]
├── impact_metric: text | null
├── status: "suggested" | "accepted" | "edited" | "rejected"
└── embedding: vector   -- Voyage AI embedding, stored via pgvector

TailoredResume
├── id, user_id
├── jd_text, jd_parsed: { required_skills[], role_type, seniority, company_type, key_responsibilities[] }
├── template_id
├── section_order: []          -- e.g. ["experience","projects","skills","education"], user-reorderable (layout customization)
├── hidden_sections: []        -- sections toggled off for this specific resume
├── layout_variant_id          -- which built variant of the template (e.g. one-column vs two-column), not freeform
├── selected_bullet_ids: []
├── retrieved_candidate_ids: []  -- full candidate set from Retrieve, before user confirms at the retrieval checkpoint (ADR-017)
├── rendered_content: json/html
├── version, created_at

ResumeBasics
├── id, user_id (one per user, not versioned like TailoredResume)
├── full_name, phone, location
├── links: { linkedin, portfolio, github }  -- all optional
├── summary: text
└── updated_at
                                            -- edited in Profile → "Resume basics"; pulled into every TailoredResume at
                                            --   render time, not copied/duplicated per resume

JobListing
├── id, source, company, title, jd_text, url, ingested_at, parsed_status

Application
├── id, user_id, job_listing_id, resume_id, status, applied_at, status_history[]

User
├── id, email, password_hash, email_verified, created_at
                                            -- Google-authenticated users use the same table (ADR-010 addendum) —
                                            --   no separate "social user" shape

RefreshToken
├── id, user_id, token_hash, revoked, expires_at, created_at
                                            -- never store the raw refresh token — hash only (ADR-010)

TailoringJob
├── id, user_id, tailored_resume_id (nullable until Generate completes)
├── stage: "parsing" | "retrieving" | "awaiting_confirmation" | "generating" | "done" | "failed"
├── failed_stage: string | null           -- drives the stage-aware retry UI (ADR-015)
└── created_at, updated_at
                                            -- this is the row GET /resumes/jobs/:jobId reads; required for both
                                            --   ADR-015 (stage-level retry) and ADR-017 (two-phase confirm) to actually work.
                                            --   Full field-level detail lives in the build brief's Prisma schema (Section 4)
                                            --   — this project doc stays at the conceptual/why level, the build brief is
                                            --   the implementation-accurate source for exact types/constraints.
```

---

### ADR-018: Template count and sourcing — 3 templates, adapted from existing open layouts, not designed from scratch
**Decision:** Phase 1 ships **3 resume templates** — Clean/ATS-safe (single column, minimal styling), Modern two-column (sidebar + main column), and Compact/dense (tighter spacing, more content per page). Rather than designing each from a blank canvas, each is adapted from a genuinely open-source resume template's layout/structure (e.g. the kind of patterns found across JSON Resume themes or Reactive Resume's template set — open, not paid/proprietary products like Zety or Canva templates), then restyled to match Tailor's own design system (Section 9b).

**Why 3:** each template requires two independent renderers (a react-pdf component tree and a docxtemplater mapping, ADR-012) — more templates multiplies build/maintenance cost, not just design variety. Fewer than 2 undercuts "tailored" as a value prop (one layout can't flex across a junior vs. senior candidate). 3 covers the meaningfully distinct cases without the render-path cost of 5+.

**What sourcing existing layouts saves, and what it doesn't:** this removes the design-from-scratch hours (proven layouts, not blank-canvas work) but does **not** remove the engineering cost — each template still needs its own full react-pdf tree and docxtemplater mapping regardless of where the layout idea came from. The saving is design time, not build time.

**Caution flagged:** since this project doubles as a portfolio piece the owner may show publicly, source structural inspiration only from genuinely open-source/MIT-licensed resume template projects, not from commercial template products — avoid literally cloning a paid template's exact design.

**Amendment (Milestone 6, generate/render slice) — DOCX library + storage + a React-18 pin.** Three implementation refinements decided while building the renderers; none change ADR-012's or ADR-018's *reasoning* (render server-side in the worker, PDF via react-pdf, a dedicated lib per format, 3 templates), only the specifics:
- **DOCX library: `docx` (programmatic), not `docxtemplater`.** `docxtemplater` fills a pre-authored `.docx` template with placeholder loops — a poor fit for content that is fully generated in code across three code-defined layouts, and it would require binary `.docx` template files checked into the repo. The `docx` library builds the document programmatically, mirroring the react-pdf "layout-in-code" model, so the two formats of a template stay structurally aligned. This is a per-format library choice, not a change to the "dedicated lib per format" decision.
- **File storage behind a `FileStore` interface (R2 in prod, local disk in dev).** The worker renders PDF+DOCX at generate time and stores the bytes via `FileStore`; the web export route serves them back. R2 is used when the `R2_*` env vars are set; otherwise a `LocalFileStore` writes under `FILE_STORE_DIR` (default `.tailor-files/`) so exports work **keyless** in dev/demo (web + worker share the machine locally; in prod they share R2). Same stub-fallback pattern as the JD parser / embedder / generator.
- **Renderer boundary via injection (CLAUDE.md §7).** The react-pdf/docx renderer is worker-only and *injected* into the shared resume-engine facade at worker startup (`setResumeRenderer`); the web deployable never imports the render deps — it only reads stored bytes through `FileStore`.
- **React pinned to 18.3.1 repo-wide (npm `overrides`).** `@react-pdf/renderer` 4.x needs React 18 (its bundled reconciler throws on React 19 element internals). The web app is API-routes-only (no React rendering, so its React version is cosmetic) and React Native 0.76 already uses 18.3.1, so a single pinned React 18.3.1 is the clean, deterministic resolution — otherwise Next 15.5 / `@react-email/render` drag in React 19 and npm dedupes it into the worker, breaking PDF rendering.

---

## 7. Costing (personal project, not live)

Only real unavoidable cost is Claude API usage; everything else has a genuine free tier at this scale.

| Component | Cheapest path | Cost |
|---|---|---|
| LLM calls | Claude Sonnet (tailoring/generation) + Haiku (parsing/extraction) | ~$0-5/mo during dev |
| Embeddings | Voyage AI — 200M free tokens on voyage-4 family | $0 |
| Database | Neon or Supabase free tier (pgvector included) | $0 |
| Backend hosting | Render free tier (cold starts) | $0 |
| Auth | Self-rolled JWT — no provider cost, own compute only | $0 |
| Transactional email | Resend free tier (verification/reset emails) | $0 |
| File storage | Cloudflare R2 free tier | $0 |
| Domain | Skip during build | $0 |
| **Total during build** | | **~$0-5/month** |

**Positioning upgrade (only right before sharing the project — interviews, LinkedIn, portfolio site):** pay for a non-sleeping backend tier (~$5-7/mo) and a real domain (~$10-12/yr) so a recruiter clicking the link doesn't hit a cold start. This is a short-term spend right before sharing, not a build-phase cost.

Note: free-tier terms shift over time across providers — re-verify current limits before signing up.

---

## 8. Conversation Context — "Where We Left Off"

*(This section exists so that sharing this document alone, in a brand-new chat/account, gives Claude everything it needs to continue seamlessly.)*

**Session 1 summary (condensed — see git history / prior version of this doc for full detail):** original idea → feasibility feedback (flagged live interview recording as legally risky) → owner's background/goals established (portfolio + BA/architect positioning, real depth requested, working via Claude Code) → Phase 2 accepted, interview recording redesigned to upload-based per owner's own suggestion (ADR-005) → data model decided (ADR-002) → RAG/retrieval design decided (ADR-003, ADR-004) → costing discussed (free-tier-first) → service architecture decided: modular monolith + worker (ADR-001) → module contracts + event bus (ADR-008) → queue task granularity (ADR-009) → auth: self-rolled JWT chosen assuming real production JWT experience (ADR-010, later recalibrated — see below) → REST + BFF pattern over GraphQL (ADR-011) → template rendering (ADR-012) → CI/CD (ADR-013) → this project doc + a companion learning-notes doc produced to consolidate everything.

**Session 2 — sequence of this discussion:**
1. Claude drafted a formal PRD (`resume-copilot-prd.md`) from the Session 1 project doc, but made several unstated judgment calls in the process (email verification gating logic, upgrading "why this bullet" to a hard requirement, retry UI granularity, how much depth to give Phase 2/3, and silently skipping the two flagged-open items from Session 1: wireframes and naming).
2. Owner pushed back: the whole point of this project is that decisions get made through real discussion, in full awareness — not defaulted by Claude silently. Owner also disclosed they are new to backend/web dev generally and this is their first personal project, which raised a direct question about whether ADR-010's "real production JWT exposure" framing still held.
3. Discussed and recalibrated **ADR-010**: owner's JWT experience is consumer/client-side (they understand the flow from using it in mobile apps), not backend-implementation experience (signing tokens, hashing, rotation, revocation are new to them). Decision unchanged (still self-rolled auth) but reasoning updated — this is now framed as a deliberate first real backend-security build, not an assumed-low-risk refresher. See the recalibration note appended to ADR-010 above.
4. Discussed and decided **signup/verification gating (ADR-014)**: walked through three options (gate before Parse / before Generate / before Export) against the actual pipeline cost stages (ADR-004). Initially leaned toward gate-before-Generate (lets an anonymous user see a real preview first), but owner explicitly simplified to **gate-before-Parse**, reasoning that the guest-session complexity the more generous option requires isn't worth it before this is live/public. Simpler now, revisitable later.
5. Discussed and decided **retry UI granularity (ADR-015)**: owner explicitly chose the option that demonstrates system-design/UX thinking over the simpler option — **stage-aware retry UI**, reusing the staged-progress design language, not a single generic retry button.
6. Discussed how much depth Phase 2/3 should get in the PRD: landed on a **middle depth** — real user stories with 1–2 lines of concrete acceptance detail each, not full checklists (reserved for Phase 1) and not bare bullet points either.
7. Discussed the two previously-flagged-open items directly: owner chose to do **wireframe-level UX detail now, fully**, not deferred; naming discussion was reached but got folded into the design/color discussion below and is still not finalized.
8. **Design system overhaul** — the largest chunk of this session. Owner rejected the original indigo/restrained-radius/no-illustration system as feeling like "a formal office app," which is specifically wrong for a product meant to make an already-hectic process (job hunting) feel lighter. Extended back-and-forth through: ruling out blue overall → cool-only options (deep teal-forest, dusty denim, twilight indigo, deep cyan-slate) → clarifying the real constraint was never "must be cool," it was "not exclusively feminine-coded, not corporate" → opening to the full spectrum (terracotta, mustard, olive, muted plum/wine) → owner asking for brighter/more energetic versions of the same logic → landing on **tangerine (`#E2611E`)** as the accent color, explicitly logged as revisitable later. In parallel, developed the **organic/personality shape language** (asymmetric corner radii, wavy section dividers, tilted list cards, a small illustrated mascot motif, conversational copy tone) as the actual lever for "personality" — more so than color choice itself. This is now written up in the revised Section 9b, superseding the original design system.
9. Built the **first wireframe artifact** in this new system: the post-login home/dashboard screen, in both empty state (mascot-illustrated prompt to build the experience bank, tailoring locked below) and filled state (primary CTA, tilted resume-history cards with compact match-score badges) — see Section 9's wireframe status note.
10. Owner asked for this project doc (and its companion documents) to be rewritten to capture all of the above, specifically so that dropping these files into a brand-new chat later gives full context without re-litigating any of it.

**Session 3 — sequence of this discussion:**
1. Owner asked to finalize the product name and pick up naming again. Reviewed the existing shortlist, tried **Keyed** and **Sharpn**, mocked both as real icon/wordmark treatments (not just words) — landed on **Keyed** as more credible/legible, then the owner pointed out neither the name nor a generic mascot icon signaled "resume" or "job application" at all. Reopened naming toward literal, immediately-legible options and landed on **Tailor**.
2. Explored several icon concepts for Tailor (needle-and-thread, page-with-thread, measuring tape, match-score badge, overlapping resumes, briefcase, checkmark) — settled on **resume page + match-score badge** specifically because it's the one mark unique to what this product does, not resumes/tailoring in general.
3. Owner flagged the accent color as still too bright at full-app scale; toned tangerine (`#E2611E`) down to **burnt terracotta (`#A6420F`)** — logged as still open to revisit further, same as before.
4. Owner asked for an **explicit, screen-by-screen information architecture** — not flow-level abstractions. Defined the full IA: a 4-tab bottom nav (Home/Bank/Resumes/Profile) sitting on a 7-screen auth stack, ~25 screens total across all tabs, with exact fields specified per screen (see Section 9). This surfaced two real gaps not previously in any doc: no screen owned personal/contact info + summary (**new `ResumeBasics` entity**, Section 6), and resume layout control needed a concrete scope decision.
5. Discussed **resume layout customization** scope directly against three levels of ambition (reorder/hide sections only; + layout variants per template; full freeform builder) — freeform was explicitly rejected due to real ATS-parsing risk, which would work against the app's own core value prop. Landed on **Level 1 + 2 combined**: section reorder, section visibility toggles, and a small number of built layout variants per template — added to `TailoredResume` as `section_order`, `hidden_sections`, `layout_variant_id` (Section 6).
6. All ~25 screens were **wireframed** at the structural level (not full visual design — see Section 9b's wireframe-status note).
7. Owner asked Claude to walk the entire flow **as an unbiased first-time user**, not as the designer. This surfaced two real problems: (a) "start from scratch" at first-run led into an empty app with no fast path to a first tailored resume — a genuine time-to-value risk; (b) retrieval was entirely invisible until the final result, so a wrong match could only be corrected by a full pipeline re-run.
8. Both were fixed as new decisions: **ADR-016** (a guided single-item quick-add replaces the dead-end "start from scratch" path) and **ADR-017** (a new "retrieved matches" checkpoint screen between Retrieve and Generate, with explicit confirm-before-Generate — this changes the async API contract from single fire-and-poll to a two-phase interaction, flagged for the build brief). Two smaller fixes also came out of the same walkthrough: a non-blocking sparse-bank nudge on JD input, and a visible Resume-basics contact-info chip on the Result screen.
9. Owner asked for all docs to be brought current again — this update.

**Session 4 — sequence of this discussion:**
1. Owner corrected a stale inconsistency in this doc: Section 8's open-items list (below, prior version) still said the accent color was open/terracotta, but Section 9b already documented **dusty denim blue (`#2F4858`) as locked** from Session 3. The visual assets the owner shared (logo, home screen, illustration motifs) confirm dusty denim blue — that palette is treated as the closed, final answer; the terracotta line in the old open-items list was simply never updated after Section 9b was.
2. Owner decided the **tech stack's two remaining open framework choices**: backend API is **Next.js** (API routes only; the ADR-001 worker remains a separate plain Node process, since Next.js can't host a persistent queue consumer — see Section 5 note), mobile app is **React Native** (Flutter dropped).
3. Discussed and decided **template count and sourcing (ADR-018)**: 3 templates (Clean/ATS-safe, Modern two-column, Compact/dense), adapted from existing open-source template layouts rather than designed from scratch, to save design time without pretending it saves the render-engineering cost (each still needs its own react-pdf + docxtemplater path).
4. Produced the **build brief** (`resume-copilot-build-brief.md`) — the previously-flagged missing document — consolidating stack, repo structure, module-to-API mapping, full data model (Prisma), REST contracts (including the ADR-017 two-phase confirm sequence), auth implementation detail, worker task breakdown, design tokens, and a milestone-based build order.
5. Owner confirmed this project is **not going live imminently** — deploy timing (build brief milestone 9) and observability tooling choice can stay deferred without pressure; current priority is demonstrating architectural depth (staged pipeline, self-rolled auth, module boundaries) for portfolio purposes.
6. Owner asked for all docs brought current again — this update.
7. Owner requested two additions after reviewing the first visual screens: the logo/wordmark visible on the sign up/log in screen (added), and **Google sign-in via Firebase**. Discussed how this should connect to the existing self-rolled auth (ADR-010): decided Firebase handles only the Google OAuth handshake — backend verifies the resulting Firebase ID token server-side and mints our own access/refresh JWT pair, so email/password and Google users converge on the same session model. ADR-010's ownership reasoning is unaffected. See ADR-010 addendum.
8. All 24 remaining screens designed and delivered this session (auth stack 7, Bank tab 10, Profile tab 3, Resumes/tailoring flow 9 = 25 total with Home, IA now fully visualized), in the locked dusty-denim-blue palette.
9. Owner didn't like the static-dots loading state on the two staged-progress screens; first tried an animated flight-loader motif (paper airplane bobbing in flight), which owner also didn't like. Landed on an animated **building-blocks motif** instead — content bars sliding up and slotting into a dashed resume-page silhouette one at a time, holding fully-built, then dropping away and looping — which ties to the growing-sprout "building" metaphor already used on the first-run-choice screen. Built as an SVG with SMIL animation for design-reference purposes; flagged in the build brief that React Native needs this rebuilt with `react-native-reanimated` since RN's SVG renderer doesn't execute SMIL.
10. Owner asked for a PM-lens review of the PRD, project doc, and build brief for dev-readiness gaps. Found and fixed: stale tangerine/wireframe-only references surviving in multiple docs after later decisions superseded them (this doc's own Section 9b palette paragraph being the worst offender — confidently described tangerine as current fact well after dusty denim blue was locked); an orphaned "Why:" paragraph with no decision statement above it (converted into a proper ADR-019 for testing strategy); the data model (Section 6) missing `TailoringJob`/`RefreshToken`/`User` that the build brief's actual schema already depended on; the PRD missing acceptance criteria for Google auth entirely, despite it being fully specified elsewhere; no `.env`/error-response/pagination conventions anywhere. Added a **"Current State at a Glance" table** to the top of this doc (current-truth snapshot, overwritten in place each session, separate from the session-history narrative below it) and a **requirements traceability table** as a new PRD appendix (Section 11) — which itself surfaced one more real gap (Profile & settings screen had no backing API routes), now fixed in the build brief.

**What has NOT been decided yet (open items — natural next discussion topics):**
- Which specific layout *variants* each of the 3 templates gets (e.g. one-column vs. two-column within "Modern two-column") isn't finalized beyond the toggle shown on the layout-customization screen mockup.
- Observability specifics (logging library, whether a real dashboard tool like Axiom/Better Stack is worth it vs. just Render/Railway's built-in log viewer) — explicitly low-priority, deferred to deploy time (build brief Section 10).
- The React Native rebuild of the animated building-blocks motif (SMIL → Reanimated) hasn't been written — only the SVG design reference exists.

**Tone/working agreement to maintain if this resumes elsewhere:** every decision — architectural or design — gets made through real discussion with actual trade-offs laid out, not defaulted silently by Claude, even when a default seems reasonable. Don't simplify technical depth because the owner is newer to backend/web dev; do keep in mind they are new to this generally (not just auth specifically — this is their first personal project) when deciding how much scaffolding/step-by-step detail a build phase needs, without lowering the bar on what gets built. Keep the BA+architect positioning front and center — requirements and decision reasoning are portfolio artifacts in their own right, not just scaffolding for code. When the owner has relevant prior experience in a specific area, check what kind/depth of experience it actually is rather than assuming — as the ADR-010 recalibration shows, "I've used this before" can mean very different things depending on which side of the system they touched. Decisions explicitly marked as revisitable later (e.g. the accent color) should be treated as genuinely open, not re-litigated defensively if the owner wants to reopen them. When asked for an honest/unbiased assessment of the product (as in the Session 3 end-to-end walkthrough), give it fully and specifically — vague or hedged critique is not useful, and the two real gaps found that way (ADR-016, ADR-017) were only surfaced by walking the flow as a genuine first-time user rather than describing it from the designer's side.
