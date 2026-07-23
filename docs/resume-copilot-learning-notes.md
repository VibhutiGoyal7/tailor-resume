# Learning Notes — Tailor (formerly "Resume Copilot") Project

**Purpose:** This is your revision doc, not a spec. Every concept we've used in the architecture decisions, explained plainly, with the options we considered and why we picked what we picked. Read this to *understand and remember*, not to implement — for implementation-level decisions, see `resume-copilot-project-doc.md`.

---

## 1. Monolith vs. Microservices

**What it actually means:** A monolith is one app, one codebase, one thing you deploy. Microservices means splitting that into several independently-deployed apps that talk to each other over the network.

**The trap people fall into:** thinking microservices are automatically "more advanced" or "more scalable" and therefore always better. In reality, microservices solve a specific problem — many teams needing to ship independently without stepping on each other — at a real cost: every service boundary becomes a network call, which introduces new failure modes (timeouts, partial failures) that a normal function call never has.

**What we chose and why:** A **modular monolith** — one deployable app, internally organized into modules with strict boundaries, plus a separate **worker process** for slow background work. Reasoning: as a solo dev, we don't have the organizational problem microservices solve, so we'd be paying real complexity cost for no matching benefit. But we designed the internal boundaries so strictly (see Module Contracts below) that splitting a module into a real microservice later would be cheap, if a real reason ever showed up (e.g., job ingestion needing genuinely independent scaling).

**Key lesson:** always ask "what problem does this pattern solve, and do I actually have that problem?" before adopting it. Right pattern for right problem, not "best practice" as a blanket rule.

---

## 2. Experience Bank vs. Rendered Resume (Source of Truth vs. Derived Data)

**What it means:** Never let people edit the "final output" directly. Keep one place that holds the real, canonical data (the experience bank — your actual work history), and treat every resume you generate as something *produced from* that data, not something you hand-edit.

**Analogy:** Like a CMS (content management system) — you write a blog post once in the CMS, and it gets rendered into a webpage. You don't hand-edit the HTML directly; if you did, and later changed the original post, your HTML edit would be lost or inconsistent.

**Why this matters practically:** if you fix a typo in your real work history, every future tailored resume should pick that fix up automatically. If resumes were edited directly, you'd have to fix the same typo in 10 different saved resumes.

**Key lesson:** "source of truth vs. derived/generated view" is a pattern that shows up everywhere in software — databases (normalized tables vs. reporting views), design (design tokens vs. rendered components), and here. Recognizing this pattern is more valuable than this specific instance of it.

---

## 3. RAG (Retrieval-Augmented Generation)

**What it means, plainly:** instead of just asking an LLM to "write a resume" and hoping it remembers everything relevant about you, you first *retrieve* the most relevant pieces of your actual data, and only then ask the LLM to *generate* using those specific pieces. Retrieval finds the right ingredients; generation cooks with them.

**Why not just dump everything into the prompt?** Because your full experience bank could be large, most of it is irrelevant to any one JD, and it costs money/time to process more tokens. Retrieval narrows it down to what's actually relevant first.

**The three stages we designed (parse → retrieve → generate):**
1. **Parse** — turn the messy JD text into clean structured data (required skills, seniority, etc.) so you have something precise to search with.
2. **Retrieve** — use that structured data to pull out only the most relevant bullets from your experience bank.
3. **Generate** — hand the LLM just those relevant bullets (not everything) and ask it to select/rewrite them.

**Key lesson:** breaking a complex LLM task into separate, smaller stages (rather than one giant prompt doing everything) makes each stage easier to test, debug, and reason about independently — same principle as ADR-009's queue staging.

---

## 4. Embeddings & Vector Search (the "R" in RAG)

**What an embedding actually is, plainly:** a way to turn text into a list of numbers (a vector) such that texts with *similar meaning* end up with *similar numbers* — even if they don't share any of the same words. "Led a team" and "managed engineers" would end up numerically close, even though no words match.

**Why this beats plain keyword matching:** keyword matching only catches exact or near-exact word matches. If a JD says "machine learning" and your bullet says "TensorFlow," keyword matching misses the connection; embeddings can catch it because the *meaning* is related.

**What we chose:** embeddings via Voyage AI (Claude itself doesn't generate embeddings — that's a separate kind of model), stored using `pgvector` (an extension that lets Postgres itself do this similarity search, so we don't need a whole separate database just for this).

**The hybrid approach:** we combine embedding-based (semantic) matching with a boost from exact tag matches — so if a bullet is tagged exactly "Flutter" and the JD requires "Flutter," that gets ranked extra high, on top of whatever the semantic search found. Best of both: broad, meaning-based recall, plus precision where you have exact matches.

**Key lesson:** "semantic search" is the general concept — this shows up anywhere you need to find "things like this" rather than "things containing this exact word" (recommendation systems, search engines, document retrieval).

---

## 5. Module Contracts (the "restaurant kitchen" analogy)

**What it means, plainly:** each part of your app (module) exposes a fixed, deliberate list of things other parts are allowed to ask it to do — like a restaurant menu. Nobody outside the kitchen (module) reaches in and grabs ingredients (database rows, internal logic) directly; they order off the menu (call the module's public functions) and let the kitchen handle it internally.

**Why this matters:** if every part of your app can directly poke into every other part's data, your codebase turns into a tangled web where changing one thing breaks five unrelated things, and you can never confidently modify anything in isolation. A fixed "menu" per module means each module's internals can change freely as long as the menu (contract) stays the same.

**The rule we set:** dependencies only flow one direction (no module-A-calls-B-calls-A cycles), and every contract method has to be honest about whether it's fast (returns an answer right away) or slow (returns a "job in progress" handle instead of pretending to finish instantly).

**Key lesson:** this concept has many names depending on context — "encapsulation" (OOP), "API design," "bounded contexts" (domain-driven design) — but it's the same underlying idea: define a stable, deliberate boundary between parts of a system, and never bypass it.

---

## 6. Direct Calls vs. Event Bus

**What it means, plainly:**
- A **direct call** is like walking up and asking someone directly — you know exactly who you're asking, and you can trace what happened step by step if something goes wrong.
- An **event bus** is like pinning a notice to a public board — you announce "this thing happened," and don't know or care who reads it. Other parts of the app can choose to "subscribe" and react, without the part posting the notice needing to know they exist.

**Why not use events everywhere?** Because it becomes harder to trace what actually happens when something breaks — instead of following one clear call stack, you have to go hunt for "who's currently subscribed to this notice board."

**What we chose:** direct calls as the default (simpler, traceable), except for `applications` status-change notifications, which go on an event bus — because we already know a future module (interview prep) will likely want to react to that without us having to go edit the `applications` code later.

**Key lesson:** decoupling (event-driven design) is a tool for a specific problem — "many current or future things need to react to one event, without the source needing to know about all of them." Don't reach for it by default; reach for it when you can name the actual future flexibility you need.

---

## 7. Queue Task Granularity (staged vs. monolithic background jobs)

**What it means, plainly:** when you hand off slow work (like calling an LLM) to a background worker, you can either give it as one big job ("do everything") or break it into a chain of smaller jobs ("do step 1, then hand off to step 2, then step 3").

**Why staged is often better once things take multiple steps:** if step 3 fails, you only have to retry step 3 — you don't waste the money/time already spent successfully completing steps 1 and 2.

**What we chose:** staged tasks (parse → retrieve → generate), chained — each stage's success triggers enqueueing the next one.

**Key lesson:** this is the same underlying idea as "checkpointing" in longer processes generally — save progress at meaningful points so a failure doesn't force you back to square one.

---

## 8. JWT Authentication (access/refresh tokens, hashing, rotation)

**Authentication vs. authorization, plainly:** authentication is proving who you are (logging in); authorization is deciding what you're allowed to do once you're known. This app's authorization is simple — you only ever see your own data — so almost everything here is about authentication.

**Why not send your password with every request?** If your password travels on every single API call, there's more exposure for it to leak. Instead, you log in once, get handed a **token** — a signed piece of text proving you're authenticated — and send that token on every request instead. A **JWT** (JSON Web Token) is a specific, common format for that token: it carries some info (like your user ID) plus a cryptographic signature proving it came from your server and wasn't tampered with.

**Password hashing, plainly:** never store a password as-is. Run it through a one-way scrambling function (a "hash") before storing it, so even if your database leaked, the actual passwords aren't exposed. We use **argon2** — a modern, well-vetted library for this — never hand-rolled, because getting hashing subtly wrong is a real, serious security risk, not a place to improvise.

**Why two tokens (access + refresh) instead of one?** An access token is short-lived (~15 minutes) and used on every request — if it leaks, the damage window is small. A refresh token lasts longer and is used only to get a new access token when the old one expires — so the user doesn't have to log in again every 15 minutes. This split limits how much damage a leaked token can do, while keeping the app usable.

**Refresh token rotation, plainly:** each time a refresh token is used, the server issues a brand new one and invalidates the old one immediately. This means a stolen-but-unused refresh token becomes worthless the moment the real user refreshes normally — it can't be reused after that point. It requires storing (a hash of) issued refresh tokens server-side so they can be checked and revoked.

**Secure storage on mobile, plainly:** don't store tokens in plain app storage (like AsyncStorage) — use the phone's actual secure storage system (iOS Keychain / Android Keystore), which is built specifically to protect sensitive data even if the device is compromised.

**Rate limiting, plainly:** cap how many login attempts are allowed in a short window (we chose max 7) so an attacker can't just guess passwords rapidly and repeatedly.

**What we chose and why:** self-rolled JWT auth from v1, instead of a managed provider like Clerk — reversed from the original plan. The original reasoning was "auth is easy to get subtly wrong, so outsource it while unfamiliar." That reasoning was revisited once it became clear there's already real production JWT exposure from work — implementing something already understood is a much lower-risk position than learning from zero, and it's a stronger, more ownable story for portfolio purposes than "I integrated a managed service."

**Key lesson:** the right call on "build vs. buy" depends heavily on what you already know, not just on the abstract complexity of the thing — the same task can be the right or wrong thing to build yourself depending on your starting point.

**A more precise look at "already know it" (added after revisiting this decision):** on closer discussion, "real production JWT exposure" turned out to mean *consuming* the flow from a mobile app — storing tokens securely, sending them on requests, handling expiry — not *implementing* the backend side that issues, signs, hashes, and rotates them. Those are genuinely different skills. The decision didn't change (self-rolled auth is still the right call), but it's worth being honest that this is closer to a first real attempt at backend security than a refresher. Concretely, that means: budget real time to actually understand *why* argon2 is preferred over something like bcrypt (it's designed to resist GPU-parallelized cracking attempts better), *why* rotation defeats a stolen refresh token (each use invalidates the previous one, so a copied-but-unused token becomes worthless the moment the real user's token gets refreshed), and *what a revocation store actually is in practice* (a server-side table of currently-valid token hashes you can check against, and delete from, to immediately invalidate a session) — not just accept these as given facts to implement.

**Key lesson (extended):** "I've done this before" is worth a follow-up question — *which side of it* did you do? Client-side and server-side experience with the same concept (auth, payments, file uploads, anything with a client/server split) can look identical when described in one sentence but carry very different risk profiles in practice.

---

## 9. REST vs. GraphQL, and the "Backend for Frontend" pattern

**REST, plainly:** fixed URLs, each returning a fixed shape of data. `GET /users/123` always gives you the same shape of user data. Simple and predictable.

**GraphQL, plainly:** one URL where the client itself describes exactly which fields it wants, potentially pulling from several underlying resources in a single request. Powerful when a screen needs data stitched from multiple places, but a genuinely different way of building and thinking about an API (schema, resolvers) — more new concepts to learn than REST.

**Why this choice isn't just "pick the fancier one":** the right choice depends on what you already know, not just on which pattern is theoretically more powerful. GraphQL would've handled the "application detail needs data from three modules" problem more elegantly in one request — but it's also a much bigger new-concept jump than REST, which was already familiar. This is the same "build vs. buy" reasoning from the auth decision, just inverted: there, existing familiarity pushed toward building it yourself; here, *lack* of familiarity (relative to REST) pushed toward the simpler, already-known option. Depth-over-speed doesn't mean always picking the technically fancier pattern — it means being deliberate, and sometimes the deliberate choice is "not yet."

**The problem that was actually being solved:** a mobile screen needing data from multiple modules (e.g., an application, its resume, and the job it's for) either means multiple round-trips from the client, or a smarter API.

**What we chose: a "Backend for Frontend" (BFF) pattern, in miniature.** Rather than adopting GraphQL wholesale, we build a small number of purpose-built endpoints that combine data server-side for the specific screens that need it (e.g., `GET /applications/:id/detail`), while everything else stays plain, simple REST. This gets most of the practical benefit (no client-side stitching) without the full learning investment.

**Key lesson:** "backend for frontend" is a real, named pattern worth knowing regardless of REST vs. GraphQL — the general idea is: shape your API around what the client screens actually need, rather than forcing the client to assemble raw resources itself. It's another instance of the same idea as module contracts (Section 5) — a deliberate boundary designed around the actual caller's needs, not just a raw mirror of your internal data structure.

---

## 10. Template Rendering & CI/CD

**Template rendering, the real question:** how does structured resume data actually become a downloadable PDF/DOCX file? Options range from "render HTML/CSS and screenshot it to PDF using a real headless browser" (flexible, but resource-heavy) to "build the layout as code components in a lighter-weight library purpose-built for documents" (less flexible, much lighter).

**What we chose and why:** `@react-pdf/renderer` — build each resume template as React components, rendered straight to PDF without spinning up a browser. Chosen specifically because of a constraint we locked in earlier (free-tier hosting with limited memory) — a full headless Chromium instance was a real risk there. It also matches an existing mental model (React/React Native) rather than introducing a new one.

**Key lesson:** a technical decision that looks purely aesthetic ("which rendering library") often traces back to an earlier constraint (hosting/cost) — good architecture reasoning connects decisions to each other instead of treating each one in isolation.

**How many templates, and where they come from (ADR-018):** landed on 3 (Clean/ATS-safe, Modern two-column, Compact/dense) rather than more, because each template costs two full render implementations (react-pdf tree + docxtemplater mapping) — template *count* is really an engineering-cost decision disguised as a design one. Each template's layout is adapted from an existing open-source resume template's structure rather than designed from a blank canvas, which saves design time but not build time — worth being precise about that distinction rather than implying it's a shortcut on both.

**CI/CD, plainly:** CI (continuous integration) means automatically checking your code (tests, linting) every time you push, so problems are caught immediately. CD (continuous deployment) means automatically shipping passing code to your live server, instead of deploying by hand.

**What we chose:** GitHub Actions with two workflows — checks on every pull request, build-and-deploy on merge to `main`. Deliberately simple and standard, not embellished — a real, demonstrable pipeline is worth more than an impressive-looking but unnecessary one.

**Key lesson:** "boring and correct" is often the stronger engineering choice, and being able to explain *why* you kept something simple is just as valuable in an interview as explaining a sophisticated choice — it shows judgment, not just capability.

---

## 11. Where to put a signup wall (gating async, costly work)

**The general problem, plainly:** any time a feature costs you real money to run (an LLM call, an API call you're billed for), and *anyone* on the internet can trigger it without an account, you're exposed to a script hammering that feature and running up a bill you didn't approve. This is why almost every AI product asks you to sign up before it does the expensive part.

**The real trade-off, not just "always gate immediately":** the further you let someone go before asking them to sign up, the more of your product they've actually experienced — which is a genuinely more persuasive moment to ask for an account. So the honest question isn't "gate or don't," it's "gate at which point," weighed against how much of the expensive work happens before that point.

**What we chose:** gate right at the very start — before the JD-parsing step even runs — rather than letting a stronger "show them something real first" flow happen further in. The reasoning wasn't "simpler is always better" in the abstract; it was specifically that the more generous option requires tracking an anonymous user's in-progress session across the signup step (a real, if small, piece of extra design), and that complexity has no real anonymous traffic to protect against yet, since this isn't live/public. Cheap to keep simple now, cheap to move later, because the pipeline stages were already cleanly separated for other reasons (ADR-004).

**Key lesson:** "where do I put the friction" is a real, recurring product design question — the right answer depends on your actual cost exposure and actual traffic, not a rule of thumb. It's fine — often correct — to choose the simpler option deliberately when the more sophisticated one is solving a problem you don't have yet.

---

## 12. Making staged architecture visible in the UI (stage-aware retry)

**The situation:** the backend already breaks the tailoring pipeline into three separate, independently-retryable stages (Section 3/7 above — parse, retrieve, generate) purely for reliability and cost reasons. That work is real either way. The question was whether the *user* should be able to see it.

**The two options, plainly:** one generic "something went wrong, try again" button that quietly does the smart thing underneath (retries only the failed stage) — versus a UI that actually shows each stage's state (done / in progress / failed) so the user can see exactly what happened and retry precisely the piece that broke.

**What we chose and why:** the more visible, more work-to-build option — because the whole point of this project is to *show* system design thinking, not just have it exist invisibly. A generic spinner would hide the exact thing (the staged pipeline) that's meant to be a demonstrable, explainable piece of architecture.

**Key lesson:** sometimes the "better engineering" and the "better portfolio artifact" point in the same direction, but they're not automatically the same question — it's worth asking both explicitly ("is this the right engineering call" and separately "does this actually demonstrate the thing I want to be known for") rather than assuming one answer covers both.

---

## 13. Designing personality into a UI (and where it actually lives)

**The mistake it's easy to make:** assuming "personality" comes from picking a fun color. It was tried first, and the result — same rounded-rectangle cards, same grid layout, just a different paint color — didn't feel any different. Personality wasn't a color problem.

**What personality actually turned out to be made of, in this project:** irregular/organic shapes instead of uniform rounded rectangles (asymmetric corner radii, a wavy header instead of a straight line); slight, deliberate imperfection (list cards tilted a degree or two, alternating direction, instead of perfectly grid-aligned); a small recurring illustrated character instead of a generic icon; and conversational, specific copy instead of generic UI labels ("Your resume's a little empty right now" instead of "No resumes yet"). Color still matters, but it turned out to be doing much less of the work than shape, illustration, and voice.

**How the actual color was chosen, separately:** once shape/illustration/copy were handling "personality," color became a narrower, more specific question — cool vs. warm, corporate vs. not, and specifically not reading as an app made exclusively for one gender. Landed on a bright, warm tangerine — chosen for energy and gender-neutral warmth, explicitly logged as changeable later rather than a permanent lock.

**Key lesson:** when a design feels generic or lifeless, resist the instinct to reach for "different color" as the first fix — ask what's actually driving the "template" feeling (usually shape uniformity, lack of any illustration, or generic copy) before touching the palette. Color is often the easiest lever to pull and the least effective one on its own.

---

## 14. Naming, Icon, and Color — how they actually got decided (finalized)

**Naming — decided: Tailor.** The shortlists below were the early candidates; the actual path to a decision went through a detour worth remembering. "Keyed" was chosen first — short, real word, sounded credible — and got as far as a mocked-up icon and wordmark before a simple test caught the problem: **neither the name nor a generic icon told anyone what the app actually does.** A name can sound good in isolation and still fail the moment it needs to do real work (an app store listing, a portfolio README, a first glance). "Tailor" won specifically because it needs zero explanation — it's exactly what the app does, in one word.

*Original shortlist, for the record:*
- Batch 1 (craft metaphor): Chisel, Loom, Facet, Contour, Precis, Bespoke
- Batch 2 (plain words): Suited, Aptly, Weft, Sharpn, Keyed

**Icon — decided: resume page + match-score badge.** Several tailoring-themed icons (needle and thread, measuring tape) were tried first and rejected for the same reason "Keyed" was — they signaled "tailoring" as a craft, not "resume" or "job application" specifically. The winning concept combines a resume-page shape with the match-score badge — the one visual element that's actually unique to this product, since a generic resume app can't have a match score at all.

**Key lesson:** when a name or icon isn't landing, the fix usually isn't "try a different word/shape in the same category" — it's checking whether the *category itself* is answering the actual question. "Sounds nice" and "tells you what this is" are different tests, and a name can pass the first while failing the second.

**Color — dusty denim blue, now locked.** Burnt terracotta (Session 3's answer) was tested once more against a cooler, muted blue after the owner reflected that cooler tones read more professional for a resume tool specifically — and by this point the illustration system above was carrying enough of the "not corporate" personality on its own, so blue was no longer off the table. The earlier concern about blue was really about *bright, saturated* blue — a muted, dark blue (`#2F4858`) doesn't trigger the same "generic SaaS" read. This is a firmer decision than burnt terracotta was, made after seeing the full illustration system and tightened shape language applied together rather than as an isolated swatch.

**A related lesson from finalizing the icon:** the first pass at the app icon used a plain uniform rounded square, a straight document, and a perfect circle badge — technically fine, but it didn't follow the app's own personality rules (asymmetric shapes, tilt, organic silhouettes) that had just been established for every other screen. **A brand mark needs to follow the same design system as the product it represents, not exist as a separate, more "neutral" object** — it's easy to treat a logo as a special case that gets simpler/safer treatment, but that just makes it feel disconnected from everything else.

**Another lesson, from choosing the illustration motifs themselves:** the first replacement for the smiley face was still a face-adjacent character (dots for eyes, a curved mouth) drawn in a slightly different style — same trope, different execution. The actual fix was dropping the "character with an expression" idea entirely in favor of shapes tied to *what the app does* (a paper airplane for sending, a signature flourish for identity, a sprout for growth) — meaning carried by the object's relationship to the product, not by giving an object a face.

---

## 15. Scoping a feature by its risk to your own value proposition (layout customization)

**The situation:** "let users control their resume's layout" sounds like one feature, but it's really a spectrum — reorder sections, pick a layout variant, or a full freeform drag-and-drop builder — and each level costs roughly an order of magnitude more than the last.

**The decision that mattered more than the effort estimate:** the freeform builder (Level 3) wasn't rejected mainly because of cost — it was rejected because **highly customized layouts are exactly what breaks ATS (applicant tracking system) parsing**, which is the exact problem this whole app exists to help someone get past. A feature can be technically buildable and still work directly against the product's own reason for existing.

**Key lesson:** before scoping a feature by "how much effort is this," check whether the feature could quietly undermine the thing that makes the product valuable in the first place. Effort and value are the usual two axes to weigh — but sometimes a third axis (does this actively work against our own core promise) matters more than either.

---

## 16. Walking your own product as a stranger would

**The situation:** every screen had been individually designed and reviewed, and each one seemed reasonable in isolation. It was only when asked to walk the *entire* flow, start to finish, from a first-time user's perspective rather than the designer's, that two real problems surfaced: a dead-end onboarding path with no fast route to actual value, and an invisible pipeline step with no way to correct a mistake until much later and at much greater cost.

**Why reviewing screen-by-screen didn't catch this:** each individual screen was fine on its own terms — the "start from scratch" screen was a reasonable screen, the staged-progress screen was a reasonable screen. The problems only existed in the *gaps between* screens and in the accumulated experience of going through all of them in sequence — exactly the kind of thing that's invisible when you're the one who already knows how everything connects.

**Key lesson:** designing screen-by-screen and walking the full flow end-to-end as a genuine outsider are two different review passes that catch different classes of problems — neither substitutes for the other, and the second one is worth doing deliberately, not just assumed to happen naturally once all the pieces exist.

---

## How to use this doc going forward

Each new concept we cover gets a new numbered section here, written the same way: plain explanation → why it matters → what we chose and why → the transferable lesson. When you're prepping for an interview, this is what you skim to refresh *understanding*; the architecture doc is what you skim to refresh *specifics*.
