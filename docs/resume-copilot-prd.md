# Tailor — Product Requirements Document (PRD)

**Status:** Revised through direct discussion across four working sessions. Reflects ADR-014 (verification gate before Parse), ADR-015 (stage-aware retry), ADR-016 (guided onboarding quick-add), ADR-017 (retrieval checkpoint before Generate), and ADR-018 (3 templates) as actually decided. Full information architecture (~25 screens) is taken to full high-fidelity visual design (see project doc Section 9). Product name and app icon are finalized: **Tailor**.
**Owner:** Vibhuti Goyal
**Companion documents:** `resume-copilot-project-doc.md` (architecture/ADR log — the "why"), `resume-copilot-learning-notes.md` (concept explainers), `tailor-build-brief.md` (build-ready handoff spec — the "how")
**Last updated:** July 2026 (fourth working session)

---

## 0. Purpose and How to Read This Document

This PRD is the requirements layer that sits on top of the architecture decisions already locked in `resume-copilot-project-doc.md`. That document answers "what did we decide and why." This document answers "what does the system need to do, for whom, and how do we know it's done."

This document does **not** repeat architecture reasoning — where a requirement depends on an architectural decision, it references the ADR by number instead of re-explaining it. If you need the "why" behind a technical choice, go to the project doc.

Scope of this PRD: **Phase 1 (MVP) is specified in full depth** — this is what gets built first and is the actual differentiator. Phase 2 and Phase 3 are specified at a lighter, directional level (enough to keep Phase 1 design decisions forward-compatible) since they are not being built yet and detailed specs for them would go stale before they're needed.

---

## 1. Product Summary

An app that helps a job-seeker produce a resume genuinely tailored to a specific job description — not a template filler, but a system that understands the person's real experience (via structured input and free-form reflection) and the target job, then produces a resume that emphasizes the right material in the right language and format.

**Primary differentiator:** a real retrieval-augmented pipeline (ADR-003, ADR-004) that grounds every generated resume line in the user's actual experience bank, rather than an LLM freely inventing or paraphrasing content.

---

## 2. Goals and Non-Goals

### Goals (Phase 1)
- Let a user build a structured, reusable "experience bank" once and draw from it for every future resume.
- Let a user paste a job description and get back a resume that is demonstrably tailored to that JD — not a generic resume with the JD's title swapped in.
- Make the tailoring process legible: the user can see *why* a given bullet was chosen or rewritten, and what source experience it came from.
- Support multiple resume formats/templates suited to different company types.
- Export to PDF and DOCX.
- Ship a live, usable version from early in the build — not a big-bang launch at the end.

### Non-Goals (Phase 1)
- Job discovery, scraping, or application tracking (Phase 2).
- Interview prep/coaching (Phase 3).
- Fully automated ("silent") job applications — out of scope for the whole product, not just Phase 1 (ADR-007).
- LinkedIn data ingestion in any form (ADR-006) — permanent non-goal, not a phase boundary.
- Supporting resume formats/languages beyond what's in Section 6 (multi-language resumes, ATS-specific micro-formats, etc.) — explicitly deferred, not committed to any phase yet.

---

## 3. Personas

**Primary persona — "The Switcher"**
Someone actively job-hunting, applying to multiple roles across different companies/company types, who currently maintains one generic resume and manually (and imperfectly) edits it per application, or maintains several stale copies. Cares about relevance-per-application but doesn't have hours to hand-tailor every resume. This is the only persona Phase 1 is designed for — the product is not yet trying to serve recruiters, career coaches, or students with no work history.

---

## 4. Phase 1 — MVP: Resume Tailoring Engine

### 4.1 Feature: Experience Bank (Profile & Structured Experience)

**User stories:**

- *As a user, I can create an account and log in,* so that my experience bank and resumes persist across sessions and devices.
  - **Acceptance criteria:**
    - User can sign up with email + password; password is hashed with argon2, never stored or logged in plaintext (ADR-010, recalibrated — treat this module as a first real backend-security build, not routine).
    - User receives a verification email (via Resend) and must verify before submitting a JD or triggering any part of the tailoring pipeline — including Parse (ADR-014). There is no anonymous/guest pipeline execution in any form; the gate sits at signup, before the first pipeline stage runs, not mid-flow or after any stage completes.
    - Login issues an access token (~15 min expiry) and a refresh token; refresh tokens are rotated on use and revoked on logout (ADR-010).
    - Login/signup endpoints are rate-limited to 7 attempts before temporary lockout (ADR-010).
    - Tokens are stored in platform-secure storage on the mobile client (Keychain/Keystore), never in plain AsyncStorage/SharedPreferences (ADR-010).

- *As a user, I can also sign up or log in with my Google account,* so that I don't have to create and remember a separate password if I don't want to.
  - **Acceptance criteria:**
    - The sign up / log in screen offers a "Continue with Google" option alongside email/password.
    - Google auth uses Firebase purely as the OAuth handshake — the mobile app obtains a Firebase ID token via Google sign-in, sends it to `POST /api/auth/google`, and the backend verifies it server-side (Firebase Admin SDK) before minting our own access/refresh JWT pair (ADR-010 addendum). Firebase never issues or owns the session.
    - A Google-authenticated user is stored in the same `User` table as email/password users (matched by verified email) — not a separate social-user shape — and is indistinguishable from an email/password user in every subsequent request (same `RefreshToken` rotation/revocation rules).
    - Google sign-in is exempt from the email-verification gate (ADR-014) — Google has already verified the email — but is not exempt from any other part of the pipeline-access gate.

- *As a user who chooses "start from scratch" at first-run, I get a fast path to trying the app, not an empty screen to figure out alone,* so that I can reach a first tailored resume quickly rather than facing an open-ended setup task before any value shows up (ADR-016).
  - **Acceptance criteria:**
    - Choosing "start from scratch" leads directly into one guided quick-add screen — title/company plus a free-form "what did you do" input, routed through the existing extraction flow (the story below) — not a bare empty app.
    - After that single item is saved, the user sees an explicit choice: "tailor a resume now" or "add more to your bank first" — never silently dropped into the app with no clear next step.
    - Skipping this quick-add step remains possible; it is a fast path, not a forced gate.

- *As a user, I can add structured experience entries (roles, projects, education, skills),* so that I have a reliable, reusable source of truth for my work history.
  - **Acceptance criteria:**
    - User can create an `ExperienceItem` of type `role`, `project`, `education`, or `skill`, with structured fields appropriate to that type (title, company, dates, etc.).
    - Each `ExperienceItem` can have zero or more `ExperienceBullet`s attached.
    - Editing a structured field (e.g. fixing a job title typo) does not require touching any previously generated resume — it only affects future tailoring runs (ADR-002).

- *As a user, I can write about my experience in free form (not structured fields) and have the system extract candidate bullets,* so that I don't have to translate my own experience into "resume-speak" myself.
  - **Acceptance criteria:**
    - User can submit free-form text against an `ExperienceItem`; the system returns a set of suggested `ExperienceBullet`s extracted from that text via LLM call.
    - Each suggested bullet is shown with an accept / edit / reject action before it is saved to the experience bank; nothing is saved silently.
    - An accepted-but-edited bullet is stored with the user's edited text, not the original LLM suggestion, and its `status` is `edited` (not `accepted`) so provenance is preserved (see data model in build brief).
    - A rejected suggestion is discarded and does not appear again for the same input text.
    - If extraction fails (LLM error, empty result), the user sees a clear error state and their original free-form input is not lost.

- *As a user, each of my experience bullets can carry tags and an impact metric,* so that retrieval (Section 4.2) has something concrete to match against.
  - **Acceptance criteria:**
    - `tags` is a user-editable list of strings on each bullet (skills/keywords).
    - `impact_metric` is an optional free-text field (e.g. "reduced load time by 40%").
    - Every accepted or edited bullet gets an embedding generated and stored (ADR-003) — this happens automatically, not as a user-triggered action.

- *As a user, I can enter my personal info and a professional summary once, separately from my work history,* so that every tailored resume has a name, contact info, and summary without me re-entering it each time.
  - **Acceptance criteria:**
    - A single `ResumeBasics` record per user (not versioned like `TailoredResume`) holds full name, phone, location, links (LinkedIn/portfolio/GitHub, all optional), and a summary/headline.
    - Edited from Profile → "Resume basics"; pulled into every `TailoredResume` at render time, not copied/duplicated into each resume record.
    - If any field is missing when generating a resume, this is surfaced visibly at the Result screen (see 4.2) with a direct link to complete it — never a silent gap in the exported document.

### 4.2 Feature: JD-Aware Resume Tailoring

**User stories:**

- *As a user, I can paste or upload a job description and get a tailored resume generated from my experience bank,* so that I don't have to manually rewrite my resume for every application. This requires a verified account already in place (ADR-014) — there is no anonymous/preview path into this flow.
  - **Acceptance criteria:**
    - User submits raw JD text; system responds immediately with a job handle (e.g. `{ jobId }`), not a blocking wait — matches the async contract in ADR-008/ADR-011.
    - The UI shows the three pipeline stages explicitly and individually — Parsing, Retrieving, Generating (ADR-004/ADR-009) — each with its own visible state (pending / in progress / success / failed), using the design system's staged-progress copy (e.g. "Reading the job description" → "Finding your best-fit experience" → "Writing it in their language", project doc Section 9b). This is a stage-aware UI, not a single generic spinner (ADR-015).
    - The JD is parsed into structured fields (`required_skills`, `nice_to_have_skills`, `role_type`, `seniority`, `company_type`, `key_responsibilities`) before retrieval begins (ADR-004 stage 1).
    - Retrieval is grounded in the user's actual experience bank — the generated resume must not include claims, skills, or bullets that don't trace back to a bullet in the experience bank (ADR-004's "grounding reference" guardrail).
    - Each generated bullet on the resulting resume can be traced back to the source `ExperienceBullet` it was derived from (this must be inspectable, even if not surfaced prominently in v1 UI — see 4.2 next story).
    - **If the pipeline fails, only the failed stage shows an error and a retry action; already-succeeded stages remain visibly marked done (ADR-015).** Retrying re-triggers only the failed stage's queue task — it does not re-run succeeded stages. This is a hard v1 requirement, not deferred polish, since it's the visible expression of the staged architecture (ADR-009) the project is meant to demonstrate.
    - The job-status polling endpoint (`GET /resumes/jobs/:jobId`, ADR-011) must return which specific stage the job is currently on or failed at, not just an overall pending/done/failed status — the stage-aware UI depends on this.
    - **This is a two-phase interaction, not a single fire-and-poll call (ADR-017):** after Retrieve completes, the pipeline pauses for the retrieval-checkpoint story below — Generate is not enqueued until the user explicitly confirms.

- *As a user, I can review which of my experience items were matched before the resume is actually written,* so that a bad retrieval match gets caught and fixed before the costly generation step runs, not only after (ADR-017).
  - **Acceptance criteria:**
    - Between the Retrieving and Generating stages, the user sees a "here's what we found" screen listing the retrieved candidate experience items, each with a checkbox (checked by default if selected by retrieval).
    - The user can uncheck any item before proceeding; unchecking removes it from the candidate pool passed to Generate.
    - Generate's queue task is only enqueued after explicit confirmation ("looks good, continue") — never automatically chained from Retrieve's completion.
    - This is a hard v1 requirement: it directly fixes a real gap (retrieval was previously correctable only via a full pipeline re-run after seeing the final result), not a nice-to-have.

- *As a user, I see a warning if my experience bank is sparse before I try to tailor a resume,* so that I understand why results might be thin, without being blocked from trying anyway.
  - **Acceptance criteria:**
    - The JD input screen shows a non-blocking nudge banner (e.g. "Your bank has 1 item — add more for stronger matches") when the bank has very few items.
    - The primary "start tailoring" action remains enabled regardless — this is informational, never a gate.

- *As a user, I can see why a bullet was included or how it was rewritten relative to my original,* so that I trust the output and can catch mistakes.
  - **Acceptance criteria:**
    - For each bullet on a generated resume, the user can view (a) the source `ExperienceBullet` it came from and (b) what changed in the rewrite, at minimum as a side-by-side or "view source" affordance.
    - This is a Phase 1 requirement, not deferred polish — it is the feature that makes the RAG pipeline's value visible and trustworthy rather than a black box.

- *As a user, I can choose a resume template, or accept an auto-suggested one,* so that the resume's format fits the company/role type.
  - **Acceptance criteria:**
    - System auto-suggests a `template_id` based on `jd_parsed.company_type` via simple rule-based mapping (ADR-012) — this must not require an LLM call.
    - User can override the suggested template from the available set (3 templates — Clean/ATS-safe, Modern two-column, Compact/dense — per ADR-018).
    - Switching templates re-renders the same selected bullets in the new template's layout without re-running the tailoring pipeline (rendering and tailoring are decoupled).

- *As a user, I can reorder sections, hide sections I don't need, and pick a layout variant for my chosen template,* so that I have real control over how my resume is structured without risking ATS-breaking custom layouts.
  - **Acceptance criteria:**
    - This is deliberately scoped as reorder + show/hide + a small number of built layout variants per template (e.g. one-column vs. two-column) — **not** a freeform drag-and-drop builder, which was explicitly rejected for undermining ATS parsing (see project doc's design discussion).
    - `TailoredResume` stores `section_order`, `hidden_sections`, and `layout_variant_id`; the renderer loops over these rather than a fixed layout.
    - This is a dedicated step in the flow, between the Result screen and Export — not bundled into template selection.

- *As a user, I can export my tailored resume as a PDF or DOCX file,* so that I can actually submit it to employers.
  - **Acceptance criteria:**
    - PDF export uses `@react-pdf/renderer`, generated in the worker process, not the API request path (ADR-012, ADR-001).
    - DOCX export uses a dedicated docx templating library, independent of the PDF rendering path (ADR-012).
    - Both exports reflect exactly what the user saw in-app for that template/version/layout customization — no silent formatting drift between preview and export.

- *As a user, each generated resume is saved as a distinct, versioned artifact,* so that I can revisit or compare past tailored resumes without losing history.
  - **Acceptance criteria:**
    - Every completed tailoring run produces a new `TailoredResume` record with its own `version`, `jd_text`, `template_id`, `section_order`/`hidden_sections`/`layout_variant_id`, and `selected_bullet_ids` — never an in-place overwrite of a previous resume (ADR-002).
    - User can view a list/history of previously generated resumes and open any past one, with rename, duplicate, and delete actions available from the detail view.

---

## 5. Phase 2 — Job Discovery & Application Tracking (middle-depth scope)

Not built yet. Specified at a middle depth — real user stories with light acceptance detail, not full checklists — since exact detail may shift once Phase 1's as-built module contracts are known. Full checklist-level acceptance criteria to be written in a dedicated pass before Phase 2 actually starts.

- *As a user, I can browse job listings pulled from real job boards,* so that I don't have to manually hunt across multiple sites.
  — Ingestion prioritizes official job board/aggregator APIs (Greenhouse, Lever, Ashby, Adzuna, USAJobs, RemoteOK); career-page scraping is a fallback only, respecting `robots.txt`. **No LinkedIn ingestion in any form, ever** (ADR-006 — this is a permanent product boundary, not just a Phase 2 scope limit).

- *As a user, I can see all my applications in one place with their current status,* so that I don't lose track of where I stand with each employer.
  — Status values at minimum: applied, in review, interview, offer, rejected. Status changes are recorded with a timestamp (`status_history`), not just overwritten in place, since the `applications` module already plans to publish these changes as events (ADR-008) — history needs to actually exist for that to mean anything.

- *As a user, I can quickly apply to a job using a tailored resume, but I still review before it's sent,* so that I stay in control of what actually goes out under my name.
  — The system pre-fills an application from the selected `TailoredResume`; the user reviews and manually submits — never a silent, fully-automated submission (ADR-007), since many job boards' ToS prohibit it and generic auto-answers to screening questions carry real detection/quality risk.

- *As the system, application status changes need to be observable by future modules (specifically Phase 3) without Phase 2 code needing to know Phase 3 exists.*
  — The `applications` module publishes status-change events (e.g. "interview scheduled") on the in-process event bus already scoped for this in ADR-008, rather than a direct call — this is the one piece of Phase 2 design Phase 1's module contracts must already accommodate, even though nothing consumes the event yet.

---

## 6. Phase 3 — Interview Prep & Coaching (middle-depth scope)

Not built yet. Specified at the same middle depth as Phase 2.

- *As a user, I can upload a recording of an interview I already did,* so that I can get feedback without the app ever having to listen in live or in the background.
  — Upload-based only, never live/background capture (ADR-005 — this was a deliberate legal-risk redesign from the original concept, not a scope-convenience choice). A clear disclaimer is shown before upload: "only upload recordings you had the right to make," shifting responsibility for lawful recording to the user, the same pattern used by tools like Otter.ai/Gong/Grain.

- *As a user, I get a breakdown of my strengths and weaknesses from that interview,* so that I know what to actually work on before the next one.
  — Pipeline: transcript (from the uploaded recording) → strengths/weaknesses analysis → personalized improvement/prep plan. Because this is "process a file the user already has," not "manage a live recording session," it's a meaningfully smaller lift than the phase was originally scoped as — worth reconsidering pulling it forward if Phase 1 is solid ahead of schedule (project doc Section 3).

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Security** | Passwords hashed with argon2; JWT access/refresh pair with rotation and server-side revocation; secure token storage on mobile; login/signup rate-limited to 7 attempts (ADR-010). |
| **Data integrity** | Experience bank is the single source of truth; resumes are derived, never edited in a way that mutates source data (ADR-002). |
| **Reliability** | Multi-stage async pipelines (tailoring) must allow retry of a failed stage without re-running succeeded stages (ADR-009). |
| **Cost** | Build phase must stay within free-tier limits across providers wherever feasible (project doc Section 7); the only unavoidable recurring cost is LLM API usage. |
| **Portability** | Embedding provider (Voyage AI) is abstracted behind an internal service layer so it can be swapped without touching calling code (ADR-003). |
| **Observability** | Basic structured logging plus one dashboard, sufficient to trace a failed pipeline run to the stage and cause. |
| **Modularity** | No module accesses another module's database tables directly; all cross-module access goes through a module's public facade (ADR-008). |
| **Access control** | No part of the tailoring pipeline (Parse/Retrieve/Generate) is reachable without a verified account; the gate sits at signup, before Parse, not mid-flow (ADR-014). |
| **Product feel** | Non-corporate, personality-forward visual direction — organic/asymmetric shapes, a recurring illustrated motif system, conversational copy, dusty-denim-blue accent — deliberately not the restrained, illustration-free system originally drafted (project doc Section 9b). |

---

## 8. Out of Scope (all phases)

- LinkedIn scraping or data ingestion of any kind (ADR-006).
- Fully automated, silent job application submission (ADR-007).
- Live or background interview recording (ADR-005).
- Multi-tenant/team features, recruiter-facing tooling, or B2B use cases — this is a single-user personal tool by design.

---

## 9. Success Criteria (Phase 1)

Since this is a personal/portfolio project rather than a live product with real users, "success" is defined by demonstrable capability rather than usage metrics:

- A user can go from zero (no experience bank) to a tailored, exported PDF/DOCX resume for a real job description, entirely within the app.
- The tailoring output is demonstrably grounded — every bullet traceable to a source experience bullet — and this is visible to the user, not just true internally.
- The pipeline's staged async design is observable end-to-end (a failed stage can be identified and retried without redoing prior stages).
- The system is deployed and reachable (not just runnable locally) from early in the build, per the project's "deploy live from week one" principle (project doc Section 3).

---

## 10. Open Items

- Product naming and app icon are decided: **Tailor**, with a resume-page + match-score-badge icon (project doc Section 9b). Not an open item anymore.
- The accent color is **dusty denim blue (`#2F4858`, project doc Section 9b)**, locked.
- Phase 2 and Phase 3 detailed user stories/acceptance criteria are specified at a middle depth in Sections 5–6 above (real stories, light acceptance detail) per the owner's explicit preference — full checklist-level detail is deliberately deferred until each phase actually starts, so it reflects Phase 1's as-built module contracts rather than today's projection.
- Which specific layout *variants* each of the 3 templates gets (e.g. one-column vs. two-column within "Modern two-column") isn't finalized yet — see build brief Section 10.
- See the project doc's "Current State at a Glance" table for a full quick-reference snapshot of what's decided as of the most recent session.

---

## 11. Requirements Traceability (Phase 1)

*(Quick cross-reference so a requirement, an endpoint, a screen, and a data model entity can all be checked against each other — catches gaps like a feature existing in one doc but not another.)*

| User story (Section 4) | Screen(s) (project doc Section 9) | API endpoint (build brief Section 5) | DB entity |
|---|---|---|---|
| Sign up / log in (email+password) | Welcome, Sign up/Log in, Verify email | `POST /auth/signup`, `POST /auth/login`, `POST /auth/verify-email` | `User`, `RefreshToken` |
| Google sign-in | Sign up/Log in | `POST /auth/google` | `User`, `RefreshToken` |
| Forgot/reset password | Forgot password, Reset password | `POST /auth/forgot-password`, `POST /auth/reset-password` | `User` |
| First-run guided quick-add (ADR-016) | First-run choice | `POST /bank/items`, `POST /bank/items/:id/extract` | `ExperienceItem`, `ExperienceBullet` |
| Structured experience entries | Bank list, 4 manual forms, Item detail | `GET/POST /bank/items`, `PATCH /bank/bullets/:id` | `ExperienceItem`, `ExperienceBullet` |
| Free-form extraction | Write about it, Bullet review | `POST /bank/items/:id/extract`, `PATCH /bank/bullets/:id` | `ExperienceBullet` |
| Resume basics | Resume basics | `GET/PUT /bank/basics` | `ResumeBasics` |
| JD-aware tailoring, staged progress | JD input, Staged progress (parse/retrieve) | `POST /resumes`, `GET /resumes/jobs/:jobId` | `TailoringJob` |
| Retrieval checkpoint (ADR-017) | Retrieved matches | `POST /resumes/jobs/:jobId/confirm` | `TailoringJob` |
| Stage-aware retry (ADR-015) | Staged progress (failed state) | `POST /resumes/jobs/:jobId/retry` | `TailoringJob` |
| Source trace per bullet | Result & template, Resume detail | `GET /resumes/:id` | `TailoredResume` |
| Template selection (ADR-018) | Result & template | `GET /resumes/:id`, `PATCH /resumes/:id/layout` | `TailoredResume` |
| Layout customization | Layout customization | `PATCH /resumes/:id/layout` | `TailoredResume` |
| Export PDF/DOCX | Export | `GET /resumes/:id/export` | `TailoredResume` |
| Resume history | Resumes list, Resume detail | `GET /resumes`, `GET /resumes/:id`, `DELETE /resumes/:id` | `TailoredResume` |
| Profile & settings | Profile & settings, How this works | *(no dedicated endpoints yet — settings are mostly static/account actions)* | `User` |

**Known gap this table surfaces:** no endpoint is specified yet for the Profile & settings screen's own actions (change password from within settings, notification preferences, delete account) — these are implied by the screen design but don't have a route in the build brief yet. Worth a small follow-up pass before mobile build reaches that screen (build milestone 8).
