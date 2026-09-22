# Roadmap: from "fills the form for you" to "finds and applies to the right jobs"

**Last updated:** 2026-09-21 · **Legend:** `[x]` done · `[~]` in progress · `[ ]` to do · steps A–F get checkboxes when they start

## Status at a glance

| Step | What | Status |
|---|---|---|
| 1 | Profile, profile-filled answers, autosave, projects, contractor note, regenerate, answer memory, onboarding, eligibility banner | Built, **uncommitted**, never run against the real model or a live submit |
| 0 | Verify and harden Step 1 | Not started |
| A | Job discovery MVP | Not started |
| B | Review queue | Not started |
| C | Dogfood gate (~50 applications) | Not started |
| D | Submission-architecture decision, then Ashby and Lever | Not started |
| E | Learning loop (replies, contractor-friendliness data) | Not started |
| F | Before other people use it (security, PII, billing) | Not started |

## Context

Step 1 gave the app a per-user **profile** (work eligibility by region and engagement type, pay, links, projects, EEO/consent) that saves automatically; deterministic **profile-filled answers** (`lib/profile/resolve.ts`); a **posting reader** that extracts hiring requirements with verbatim quotes (`lib/jobs/requirements.ts`) and compares them with the profile (`lib/profile/eligibility.ts`, shown as a banner); **answer memory** and per-question **Regenerate…**; and an **onboarding checklist**.

What is still missing is what makes it a product rather than a form-filler: **the app doesn't find jobs** (a human still pastes every URL), there is **no batch review**, **only Greenhouse** is supported, and **nothing measures whether applications work**.

What is *not yet proven*: the new prompts have never run against the real model, EEO/consent detection has seen only one real form, and no real submit has gone through the new profile/memory path. Discovery multiplies whatever is wrong there, so verify first.

## Step 0: Verify and harden what exists (2–3 days)

- [ ] **Live check of the LLM paths** (needs your OK to spend a few cents of credits). Run the posting reader over ~15 real Greenhouse postings covering: US-only, EU-only, worldwide, contractor-friendly, hires via Deel/EOR, nothing stated. Hand-label the expected result and record how many claims quote verification drops and any wrong verdicts. Keep the postings as regression fixtures. Then generate and regenerate on 2–3 of them and read the output: the contractor sentence appears only when intended, and projects are cited only as written.
- [ ] **Live EEO/consent forms:** *partly verified 2026-09-21* (one real GitLab form: gender "Decline" resolved). Import ~5 more real jobs with compliance and consent sections; fix the label/name heuristics in `lib/profile/resolve.ts` (`demographics`, `consent` slots); add the real forms as fixtures.
- [ ] **One real submit** to a job you'd genuinely apply to: check profile-filled answers pass `validateSubmission` and the Playwright fill (consent booleans, combobox selects, the `location` field that always needs a manual pick in `lib/submissions/browser.ts`), and that a memory row is written on Apply.
- [ ] **Fuzzy regions are too coarse:** every region in `FUZZY` (`lib/profile/eligibility.ts`) downgrades "blocked" to "unclear", so a US resident on an EMEA-only posting gets "unclear". Replace with a per-region list of genuinely borderline countries.
- [ ] **Sponsorship/authorization questions that name no country** ("…in your current location?") stay manual; consider using the profile's residence when the label says "current location".
- [ ] **EOR routes are ignored** by `checkEligibility` and the resolver. Define the semantics (employed through an employer-of-record in your country of residence: no local authorization needed, residency rules still apply) and implement them, or remove the option.
- [ ] **DOCX uploads can never be parsed** (`POST /api/cvs/[id]/parse` is PDF-only). Recommend adding DOCX text extraction into the same LLM extraction step; otherwise block the upload with a clear message.
- [ ] **`cvReview` shadows any re-parse** and there is no "reset to extracted" button (`app/components/cv-review.tsx`).
- [ ] **Contact fields are LLM-derived:** resolve name, email and phone deterministically from the reviewed CV, and ask once how to split first/last name.
- [ ] A plain **"Country"** select is deliberately left unanswered; decide whether residence should fill it.
- [ ] **Cost and abuse guard** before anyone else uses this: a per-user daily cap on the three LLM routes (`/api/jobs/answers`, `.../regenerate`, `/api/jobs/eligibility`), backed by a small `llm_usage(user_id, day, count)` table. There is no rate limiting anywhere today. Move the eligibility cache from in-process memory to the database (it becomes the shared posting cache in Step A).
- [ ] **Put the browser tests in the repo.** The autosave/onboarding/regenerate browser runs exist only as scratch scripts. Commit them as `pnpm test:e2e` (documented: needs the dev server and DB), and add CI.
- [ ] **Commit** in logical pieces (geo + profile; answer memory, regenerate and eligibility; onboarding). Nothing is committed since `f86e8d5`.

**Exit:** the 15-posting set has no wrong "eligible/blocked" verdicts (unclear is acceptable); one real application went through end to end.

## Step A: Job discovery MVP (about 1 week, one user first)

Goal: the app hands you a short daily list of jobs you can actually take, instead of you pasting URLs.

- **Schema:** `board` (ats, token, name, active, last_fetched_at), `job` (source_url unique, title, company, location, content hash, `requirements` jsonb, first_seen/last_seen/closed_at), `job_match` (user, job, verdict, fit score, reasons, status new/skipped/prepared/applied). Add a **job preferences** section to the profile (titles and keywords to include/exclude, seniority, minimum pay or rate, stack, deal-breakers).
- **Ingest worker** `workers/discovery-worker.ts`, modelled on `workers/cv-worker.ts` and the dispatch/reconcile pattern in `lib/cv/processing.ts` (pg-boss, `FOR UPDATE SKIP LOCKED`). Nightly per board: `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` (public; verified reachable 2026-09-21), upsert by URL, mark jobs closed when they disappear.
- **Filtering, cheapest first:** keyword and location text prefilter (free) → read requirements **once per posting** (LLM, cached by content hash) → `checkEligibility` per user (free) → LLM fit score on the survivors only, with a one-line "why it fits / what's missing". No embeddings yet: the local database is plain `postgres:17-alpine`, so pgvector would mean changing the image. Revisit when volume needs it.
- **Seeding:** start with a hand-picked list of 50–100 board tokens you care about; import curated lists and parse HN "Who is hiring" later.
- **UI:** a `/app/matches` inbox reusing `EligibilityBanner`, with **Prepare** and **Skip** (skip reasons saved as signal).
- Full form (`?questions=true`) is fetched only at Prepare time via the existing `fetchGreenhouseJob`.

**Exit:** 20 boards ingest cleanly; the top 10 matches contain no wrong-region or wrong-seniority roles by your judgment.

## Step B: Review queue (about 1 week)

- **Prepare runs in the background:** fetch the live form, run the existing server-side `generateJobAnswers`, store an `application_draft` (answers, provenance, notes, status). Attachments are chosen at approval.
- **Split `app/components/job-import.tsx` first** (now 844 lines, all client state). Extract the answer-editing state into a shared component so the single-job page and the queue use the same one.
- **`/app/queue`:** ordered by verdict and needs-input count, unanswered fields pinned, approve → the existing `/api/submissions` (keeps the `validateSubmission` drift check and the never-auto-retry rules).
- **Auto-approve, later and opt-in:** only when every answer came from the profile or memory, nothing is flagged, and the verdict is eligible.

## Step C: Dogfood gate (about 2 weeks calendar time)

Apply to ~50 jobs through the flow. This needs a minimal outcome tracker pulled forward from the learning loop: an editable outcome on each application (no response / viewed / rejected / interview / offer + date). Record: **interview rate per application**, minutes per application, manual-input count, how often you overrode the eligibility verdict, and how often you edited a drafted answer.

If the interview rate is good, that number is the pitch. If not, it shows what to fix before spending on a SaaS.

## Step D: Decision gate, then more ATSs

- **Submission architecture** is a real fork, and it should be decided from Step C data: keep the local headed worker (fine for you alone) versus a **Chrome extension or local agent** that submits from the user's own browser (CAPTCHAs, security-code emails, IP reputation, ToS make hosted headless browsers risky for a paid product).
- **ATS adapters:** extract an interface (`parseURL`, `fetchForm → ImportedJob`, `fill(page, snapshot)`) from `lib/jobs/greenhouse.ts` and `lib/submissions/browser.ts`, then add **Ashby**, then **Lever**. The requirements reader, profile resolver, eligibility check and memory all work on the normalized `ImportedJob`, so they need no change. Skip Workday.

## Step E: Learning loop

- Gmail read-only reply detection to fill outcomes automatically.
- **Company-level contractor-friendliness** built from outcomes plus the posting quotes we already store. This is the data moat for the B2B-contractor wedge.
- Resume tailoring (reorder and emphasize existing bullets only, never fabricate) and interview prep.

## Step F: Before other people use it

- **Security review** (`/security-review`): postings and user text flow into prompts. Existing mitigations to keep: schema-validated outputs, verbatim-quote verification, `manualReason` for personal questions, and no auto-answering of authorization "No".
- **PII:** encryption at rest, CV blobs out of Postgres `bytea`, account deletion and data export (saved answers are already deletable).
- **Validate willingness to pay before building billing:** recruit 5–10 remote engineers/contractors as pilot users; try a done-for-you offer at a high price; then a monthly plan or 30-day pass with Stripe.
- **Positioning:** compete on grounded answers with a review step, not volume (auto-apply tools like LazyApply and AIApply crowd that space). Wedge: remote software engineers, including B2B contractors, applying to startups.

## Decisions

| # | Question | Status |
|---|---|---|
| 1 | Spend a few cents of credits on the Step 0 live verification? | Open |
| 2 | DOCX: support it (recommended) or block the upload? | Open |
| 3 | EOR: implement the semantics above, or drop the option? | Open |
| 4 | How to seed the first list of boards (hand-picked, or a curated list you already have)? | Open |
| 5 | Hosted worker versus extension for the paid version | Deferred until Step C data |

## Verification

- **Step 0:** `pnpm test:profile`, `pnpm test:step1` and the new `pnpm test:e2e` pass in CI; the 15-posting fixture set has no wrong eligible/blocked verdicts; one real application succeeds.
- **Step A:** ingest 20 boards; spot-check the top 10 matches; confirm each posting is classified once (cache hit on the second run).
- **Step B:** Prepare 5 jobs in the background, review and approve them in the queue, confirm they submit through the existing worker.
- **Step C:** the interview-rate and time-per-application numbers reproduce from raw `submission` and outcome rows.

## Changelog

- **2026-09-21:** Rewritten after Step 1 was built. Added status table, checkboxes, decisions table. Step 1 items removed from the roadmap and summarized in Context. Added Step 0 items for coarse fuzzy regions and country-less sponsorship questions; EEO verification marked partly done (one real form).
- **Earlier:** original five-phase roadmap (profile, discovery, review queue, ATS adapters, tracking) and monetization notes.
