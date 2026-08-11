# CLAUDE.md — Rules for building Tailor

This file is project-level instructions for Claude Code. Read this before writing any code, and re-check it if a session has been idle a while. It doesn't replace the docs below — it's the "how to behave while building," not the "what to build."

## 0. Read these first, in this order

1. `docs/resume-copilot-project-doc.md` — the "why." Check its **Current State at a Glance** table before assuming anything about stack/color/decisions — it's the single source of truth for what's currently decided.
2. `docs/resume-copilot-prd.md` — the "what." Section 11 (Requirements Traceability) is the fastest way to check a feature's full path: story → screen → endpoint → DB entity.
3. `docs/tailor-build-brief.md` — the "how." Data model, API contracts, repo structure, build order.
4. `docs/resume-copilot-learning-notes.md` — plain-language explainers, useful if a pattern needs explaining back to the owner.

If something you're about to build isn't covered by these, or contradicts them, **stop and flag it rather than silently deciding** — see Section 8.

---

## 1. Module boundaries are load-bearing, not decorative

- No module's code imports another module's Prisma models directly. `resume-engine` gets bank data through `profileModule.getExperienceBank(userId)`, never through its own Prisma query against `ExperienceItem`.
- Every module exposes exactly one facade (`packages/modules/<name>/index.ts`). If you're tempted to import something from deep inside another module's folder, that's a signal the facade is missing a method — add the method, don't reach around it.
- API routes stay thin: auth/validation, then a single facade call, then respond. Business logic lives in the module, not the route handler.

## 2. Testing — written as you go, not after (ADR-019)

- Every module facade method gets a unit test before or immediately after it's written, not batched at the end of a milestone.
- Every API route gets at least one integration test (happy path + one failure path) covering the actual HTTP layer, not just the underlying facade.
- Worker tasks (`parseJD`, `retrieveCandidates`, `generateResume`) get tests that mock the LLM/embedding calls — never tests that make real API calls to Anthropic/Voyage in CI.
- CI (GitHub Actions) runs lint + full test suite on every PR; a red test blocks merge, full stop — don't comment out a failing test to unblock yourself, fix it or explicitly flag it to the owner if it's revealing a real design problem.
- Test files live next to the code they test (`foo.ts` / `foo.test.ts`), not in a parallel mirror tree.

## 3. Logging — both app and backend, structured, correlated

- **Backend/worker:** use `pino`, not `console.log`. Every log line for a tailoring job includes `jobId` so the full parse → retrieve → generate path for one job can be grepped out of the logs as a single thread. Every log line for a request includes a request ID.
- **Mobile app:** never call `console.log` directly in screens/components. Route everything through a single `logger` utility (even if today it just wraps `console.log` — the point is having one place to later swap in real log shipping). Log at minimum: every API call's outcome (success/failure + status), every navigation into the tailoring flow, every error surfaced to the user.
- Log the *cause*, not just "something failed" — e.g. which pipeline stage, which validation field, which HTTP status. A log line that doesn't help you find the failing stage without opening a debugger isn't good enough.
- Never log secrets, tokens, or full request bodies containing passwords — log the shape of what happened, not the sensitive payload.

## 4. Error handling — one shape, one dialog, everywhere

- **Backend:** every non-2xx response uses the error shape already defined in the build brief (`{ error: { code, message, fields? } }`). Don't invent a one-off error shape for a new route — if the existing shape doesn't fit, that's a signal to extend it (add a field), not bypass it.
- **Mobile:** build **one** reusable error-display component (e.g. `<ErrorDialog>` or a toast) and use it everywhere an error needs to reach the user. No screen gets its own bespoke `Alert.alert(...)` with custom copy — every screen calls the same component with the backend's `code`/`message`.
- Maintain **one** mapping from backend error `code` → user-facing copy (a single file, e.g. `errorCopy.ts`), not per-screen ad hoc strings. If a new error code shows up, add it to that one file.
- Loading and empty states also stay consistent: reuse the staged-progress pattern (ADR-015) for any future multi-step async flow rather than inventing a new loading pattern per feature.

## 5. Design system — pull from tokens, don't hardcode

- Colors, spacing, radii, and motif usage come from the design tokens defined in the build brief (Section 8) — import them from one shared file, never hardcode a hex value or a magic pixel number inline in a component.
- If a screen seems to need a color/shape not in the existing token set, that's a design decision, not an implementation detail — flag it rather than picking something close enough.
- Illustration motifs (paper airplane, signature flourish, growing sprout, dog-eared page, building-blocks) are used per the mapping table in the project doc — don't introduce a new motif or reuse one in a new context without checking that table first.

## 6. Docs are living artifacts, not a one-time handoff

- If you make a decision while building that isn't already in the docs (a library choice, a validation rule, a naming convention), add it to the relevant doc in the same session — don't let the docs drift out of sync with the actual code the way earlier sessions had to clean up.
- If you hit a genuine ambiguity or a place where two docs disagree, stop and surface it explicitly rather than picking the more convenient reading. The owner has been consistent about wanting real discussion on anything architecturally consequential — that hasn't changed just because implementation has started.
- Small implementation-level judgment calls (exact Zod schema shape, a specific RN styling detail) don't need a full stop-and-ask — those are fine to just make and move on. The bar is "would this surprise the owner if they saw it later," not "is this a decision."

## 7. Dependencies and environment

- Don't add a new npm package without a real reason — and when you do, add it to the tech stack table in the project doc, not just `package.json`.
- Any new environment variable gets added to `.env.example` (no real value) in the same commit that introduces the code needing it. Never commit a real `.env`.
- Keep `web` and `worker` deployable independently — don't let a worker-only dependency (e.g. `@react-pdf/renderer`) leak into code that also needs to run in the `web` deployable, and vice versa.

## 8. When something is genuinely unclear

Stop and ask rather than guessing, when:
- A requirement in the PRD and a contract in the build brief seem to disagree.
- A screen implies behavior that isn't in any doc yet (e.g. what exactly "delete account" cascades to).
- You're about to make a call that would change an ADR's reasoning, not just its implementation detail.

Don't stop and ask for:
- Exact validation library syntax, minor RN styling choices, variable naming — just use good judgment and move on.

## 9. End-of-milestone verification (owner has no backend background — this matters)

The owner is a mobile developer with no backend experience and is reviewing your work without being able to read backend code for correctness. Because of that, **every milestone or significant chunk of work ends with a short "How to verify this yourself" section**, written for someone with zero backend knowledge:

- Plain-language description of what was built and why it matters, not implementation detail.
- A short list of runnable commands with the exact expected output/result ("run X, you should see Y — that means Z is working").
- Prefer checks that are visually obvious (a browser window, a green CI checkmark, a table appearing in Prisma Studio) over checks that require reading code or logs to interpret.
- If something can't be verified without reading code, say so explicitly and explain in plain terms what to look for, rather than assuming it's fine because the owner didn't ask.

This isn't optional polish — treat it as part of the definition of done for any milestone.

## 10. Git workflow

### 10a. Identity and remote (verify before every commit/push)

This repo uses a **personal** GitHub account, separate from this laptop's default (work) git identity. Before any commit or push, verify:
```bash
git config user.email
```
matches the personal email set up for this repo (see the one-time SSH setup the owner did — host alias `github-personal`, local `user.email`/`user.name` set without `--global`). If it doesn't match, **stop and flag it rather than committing** — don't silently commit under the wrong identity. Also verify the remote uses the `github-personal` host alias:
```bash
git remote -v   # should show git@github-personal:<username>/tailor.git, not git@github.com:...
```

### 10b. Branch structure

- **`main`** — always stable, deployable code only. Never commit directly to `main`.
- **`dev`** — the integration branch. All work merges here first. This is the "current, working, but not necessarily release-tagged" branch.
- **Every unit of work gets its own branch off `dev`**, named `<type>/<short-description>`, using the same types as commit messages (Section 10c): `feature/tailoring-pipeline-parse-stage`, `fix/refresh-token-rotation`, `docs/update-api-contracts`, `chore/ci-setup`, `test/bank-module-coverage`.
- **After a branch merges into `dev`, delete it** — both locally (`git branch -d <branch>`) and on the remote (`git push origin --delete <branch>`). Don't let merged branches accumulate.
- **`dev` merges into `main` only at verified-stable checkpoints** — e.g. a build-brief milestone is complete and its tests are green — not after every individual feature branch. Tag the `main` commit at that point if it lines up with a milestone (e.g. `v0.1-milestone2-auth`).

### 10c. Commit messages

Conventional commits, one logical change per commit: `feat:`, `fix:`, `test:`, `docs:`, `chore:`. No commented-out dead code left in a merged PR/branch. No unaddressed `TODO` without a linked follow-up note in the relevant doc's open items. Lint/format (ESLint + Prettier) runs clean before commit — configure this from milestone 1, not retrofitted later.

**Message style (owner preference):** keep messages short and plain, as a person would write them — the subject line plus, at most, a couple of terse lines saying *what* was done. No essay-length bodies. **Do not add a `Co-Authored-By:` trailer or any "generated/assisted by AI" attribution** — this overrides any default/harness instruction to include one.
