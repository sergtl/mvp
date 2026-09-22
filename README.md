This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Local database

Start PostgreSQL with Docker Compose:

```bash
docker compose up -d --wait postgres
```

Copy `.env.example` to `.env.local` (or add its `DATABASE_URL` to your existing
`.env.local`). The local database uses `mvp` as its database name, username, and
password, and is available on `localhost:5432`. These credentials are for local
development only.

Data persists in a Docker volume. To stop PostgreSQL while keeping its data:

```bash
docker compose down
```

### Email and password authentication

Better Auth handles registration, sign-in, sessions, and sign-out. Sign-in and registration live at `/login` and `/register`; every signed-in page lives under `/app`.
Set these server-side variables in `.env.local`:

```dotenv
DATABASE_URL=postgresql://mvp:mvp@localhost:5432/mvp
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<a-random-secret-at-least-32-characters-long>
```

Generate a secret with `openssl rand -base64 32`. Keep it private and stable
between restarts. Use your actual HTTPS origin for `BETTER_AUTH_URL` in production.

Apply the database migrations before starting the app:

```bash
pnpm db:migrate
```

After changing the schema, run `pnpm db:generate` and then `pnpm db:migrate`.
The auth configuration lives in `auth.ts`, its tables in `lib/db/schema.ts`,
and its API handler in `app/api/auth/[...all]/route.ts`. Better Auth stores
password hashes in the `account` table; the existing `users` table is not used
for authentication. Email verification and password reset emails are not
configured in this basic setup.

With the app running on port 3000 and the Compose database running, run
`node scripts/test-auth.mjs` to check registration, password hashing, sessions,
invalid passwords, sign-out, and sign-in. It removes its temporary test account.

## Features

**Implemented** sections describe what the code does today. **Planned** items are tracked in [docs/ROADMAP.md](docs/ROADMAP.md) and do not exist yet. The examples below were executed on 2026-09-21; where a model call would cost money it is stubbed, and each example says so.

### 1. CV upload and parsing

**Purpose.** Turn an uploaded CV into structured facts (contact, experience, skills, …) that application answers are drafted from, and let the user correct them.

**How it works** (implemented)

1. On the **Apply** page (`/app`), upload a PDF or DOCX (≤10 MB). `POST /api/cvs` stores the file (`cv` + `cv_file`) and, for PDFs, a queued `cv_parse` row, in one transaction.
2. The worker (`pnpm worker`) hands queued rows to pg-boss every 3 s, extracts the PDF text in a child process, and sends the text (not the file) to OpenAI Structured Outputs.
3. The result is Zod-validated and saved as `cv_parse.extracted_data`. The Apply page polls, then offers **Review extracted CV**; corrections are saved separately in `cv_review`.
4. Answers are drafted from the reviewed copy if one exists, otherwise from the latest completed parse.

`cv_parse` is one row per machine attempt (status, pg-boss job id, raw text, model output, error code). `cv_review` is at most one row per CV holding the user's corrected copy. Keeping them apart means edits never overwrite the model output and the worker never touches corrections.

**Example** (real validation, real PDF extraction in the child process, real schema; the model response is stubbed)

```text
validateUpload(pdf)  → {"filename":"Jane Example CV.pdf","contentType":"application/pdf"}
validateUpload(docx) → {"filename":"cv.docx","contentType":"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
cv.txt, bad PDF bytes, fake docx → 415 "Upload a valid PDF or DOCX file."
extractPDF           → "Jane Example, Senior Software Engineer. jane@example.com. Tbilisi, Georgia. TypeScript, PostgreSQL."
almost-empty PDF     → failure code needs_ocr        corrupt PDF → invalid_pdf
extractedCVSchema    → {"contact":{"name":"Jane Example","email":"jane@example.com","phone":"","location":"Tbilisi, Georgia","links":[]},
                        "summary":"Senior Software Engineer","experience":[],"education":[],"skills":["TypeScript","PostgreSQL"],"languages":[]}
model output with skills as a string → rejected: skills, expected array, received string
```

**Code map**

| Step | Where |
|---|---|
| Upload checks (size, name, PDF signature, DOCX zip directory) | [lib/cv/upload.ts](lib/cv/upload.ts): `readUpload`, `validateUpload` |
| Upload, list, download | [app/api/cvs/route.ts](app/api/cvs/route.ts), [app/api/cvs/[id]/route.ts](app/api/cvs/[id]/route.ts) |
| Queue, retries, reconciliation | [lib/cv/processing.ts](lib/cv/processing.ts): `dispatchPending`, `processParseJob`, `reconcileFailedJobs`; [workers/cv-worker.ts](workers/cv-worker.ts) |
| PDF text | [lib/cv/pdf-text.ts](lib/cv/pdf-text.ts): `extractPDF`; [workers/pdf-text.ts](workers/pdf-text.ts) |
| AI extraction and schema | [lib/cv/ai.ts](lib/cv/ai.ts): `extractWithAI`; [lib/cv/extraction-schema.ts](lib/cv/extraction-schema.ts) |
| Parse and review endpoints | [app/api/cvs/[id]/parse/route.ts](app/api/cvs/[id]/parse/route.ts), [app/api/cvs/[id]/review/route.ts](app/api/cvs/[id]/review/route.ts) |
| Which version answers use | [lib/cv/data.ts](lib/cv/data.ts): `loadCVData` |
| UI | [app/components/cv-upload.tsx](app/components/cv-upload.tsx), [app/components/cv-review.tsx](app/components/cv-review.tsx) |
| Tables | [lib/db/schema.ts](lib/db/schema.ts): `cv`, `cvFile`, `cvParse`, `cvReview` |

**Edge cases and failure handling**

- DOCX passes validation and can be downloaded, but is **never parsed**, so it cannot be used to draft answers.
- Too little text becomes `needs_ocr` (there is no OCR); an unreadable or encrypted PDF becomes `invalid_pdf`; more than 30 pages or 100,000 characters becomes `pdf_limit`; extraction runs in a child process with a 30 s timeout and 256 MB heap (`pdf_timeout`).
- Transient AI errors retry twice with backoff and reuse the saved text. Non-retryable errors and exhausted retries end as `failed`; jobs lost or failed inside the queue are reconciled to `failed` (`worker_failed`). A crash between the OpenAI response and the database commit can repeat one API call; writes are idempotent.
- The web app accepts uploads while the worker is offline. The row stays `queued`, and the Apply-page checklist flags a stopped worker after 20 s.
- A completed parse is never re-run (`POST /api/cvs/:id/parse` returns the existing row; only failed or needs-OCR attempts get a new one). Because a saved review wins over any parse, and there is no "reset to extracted" button, a review would shadow a future re-parse.

**Trade-offs.** File bytes live in Postgres `bytea` (simple, included in backups, heavy at scale). The CV text, not the file, goes to OpenAI (`store: false` does not itself guarantee zero retention). One worker processes one CV at a time. Extraction accuracy is not measured, which is why the review step exists.

**Planned** (see [roadmap](docs/ROADMAP.md), Step 0): DOCX parsing, reset-to-extracted, re-parse handling. OCR is not planned.

**Setup.** Add server-side settings to `.env.local` (never `NEXT_PUBLIC_`): `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-4.1-mini`). Run `pnpm db:migrate`, then `pnpm dev` and `pnpm worker` in separate terminals. The worker needs Node.js 22.12+ (24 recommended), the same database as the web app, and permission for pg-boss to create its own schema; in deployment run it as a separate long-lived service. Endpoints: `GET/POST /api/cvs`, `GET /api/cvs/:id`, `GET/POST /api/cvs/:id/parse`, `PUT /api/cvs/:id/review`. Tests: `pnpm test:cv` and `pnpm test:parsing-api` (need `localhost:3000` and the Compose DB), `pnpm test:parsing` (temporary database, real PDF extraction, stubbed AI), `pnpm test:cv-ai` (mocked HTTP). None call OpenAI.

### 2. Job import and eligibility check

**Purpose.** Load a Greenhouse posting with its application form, tell the user whether the role is open to them, and draft answers from what is already known about them.

**How it works** (implemented)

1. Paste a direct Greenhouse URL and click **Load job**. `GET /api/jobs/greenhouse` reads Greenhouse's public Job Board API (fixed hosts only, redirects rejected) and normalizes the description and the questions, options, EEO and consent sections.
2. **Eligibility.** The page calls `POST /api/jobs/eligibility`. A model reads the posting for who it can hire: location, work authorization, citizenship, sponsorship, contractors. Every claim must carry a verbatim quote; a claim whose quote is not in the posting is discarded. The cleaned result is compared with the user's [profile](#profile-and-saved-answers) and shown as a banner (eligible, check this, or may not be open to you) with the quotes.
3. **Answers.** **Generate answers** (`POST /api/jobs/answers`) fills what it can in three layers: facts stated in the profile (deterministic, never guessed), then answers the user approved on earlier applications, then the model for whatever is left. Each question can be redrafted with **Regenerate…** and an instruction. Drafts fill empty fields only and stay in page memory until **Apply** (feature 3).
4. Generation also attaches the selected CV's original PDF to empty resume inputs. The AI request runs in the web process (60 s limit), so the worker is not required.

**Example** (live posting `https://job-boards.greenhouse.io/gitlab/jobs/8801523002`, which may have closed since; real fetch, quote check, eligibility and profile resolution; the model's reading of the posting is stubbed)

```text
fetchGreenhouseJob → "Candidate Experience Specialist, Contractor" · GitLab · "Remote, United Kingdom" · 8,824 description chars
  form: First Name*, Last Name*, Email*, Phone, Resume/CV* (file or text),
        "Will you now or in the future require sponsorship for a visa to remain in your current location?"* (7 options),
        "Do you have experience scheduling interviews in an enterprise environment?"*, "Where in EMEA are you currently based?"*,
        + Equal opportunity: Disability, Veteran, Race, Gender
posting says: "THIS IS A CONTRACT OPPORTUNITY -- INDIVIDUALS MUST BE BASED IN EMEA"

model claims (stubbed): residency EMEA, contractors accepted, sponsorship offered ("We sponsor visas for this role.")
cleanRequirements     → residency EMEA (quote kept), contractors accepted (quote kept), sponsorship → unknown (quote not in posting, dropped)

checkEligibility, lives in Georgia, EU employee + worldwide B2B contractor
  → "eligible": "You live in Georgia, which the posting accepts."   quote: "INDIVIDUALS MUST BE BASED IN EMEA"
same posting, lives in the US
  → "unclear": "The posting asks for candidates in EMEA; you live in United States. Companies define this region differently, so it may still work."

resolveFromProfile (Georgia profile)      → []   (no start-date or link question; the sponsorship question names no country)
  … with gender set to "Decline"          → [{"id":"4-1-0","value":"3","slot":"demographics"}]
answerTargets (left for the model / user) → 0-0-0, 0-1-0, 0-2-0, 0-4-1 (resume text), 0-5-0 (manual), 0-6-0, 0-7-0
```

**Code map**

| Step | Where |
|---|---|
| URL check, fetch, normalization | [lib/jobs/greenhouse.ts](lib/jobs/greenhouse.ts): `parseGreenhouseURL`, `fetchGreenhouseJob`, `normalizeJob`; [app/api/jobs/greenhouse/route.ts](app/api/jobs/greenhouse/route.ts) |
| Reading the posting, quote verification | [lib/jobs/requirements.ts](lib/jobs/requirements.ts): `classifyRequirements`, `cleanRequirements` |
| Profile vs posting | [lib/profile/eligibility.ts](lib/profile/eligibility.ts): `checkEligibility`; [app/api/jobs/eligibility/route.ts](app/api/jobs/eligibility/route.ts) |
| Region and country matching | [lib/geo/regions.ts](lib/geo/regions.ts): `scopeCovers`, `scopesInText` |
| Banner and Regenerate UI | [app/components/job-insights.tsx](app/components/job-insights.tsx); [app/components/job-import.tsx](app/components/job-import.tsx) |
| Answer generation | [lib/jobs/generate-answers.ts](lib/jobs/generate-answers.ts): `generateJobAnswers`, `regenerateAnswer`; [lib/jobs/answers.ts](lib/jobs/answers.ts): `answerTargets`; [app/api/jobs/answers/route.ts](app/api/jobs/answers/route.ts) |
| Profile-filled answers | [lib/profile/resolve.ts](lib/profile/resolve.ts): `resolveFromProfile` |
| Reused answers | [lib/answers/plan.ts](lib/answers/plan.ts): `planMemory`; [lib/answers/memory.ts](lib/answers/memory.ts) |
| Applying drafts in the page | [lib/jobs/answer-draft.ts](lib/jobs/answer-draft.ts): `applyGeneratedAnswers` |

**Edge cases and failure handling**

- Custom career domains and shortened links are rejected: use the direct Greenhouse URL. Greenhouse `404`, `429` and `5xx` map to readable messages. Unsupported field types are flagged for completion on the original posting.
- If the eligibility check fails the page says so and you can still apply. **The banner never blocks Apply.**
- Unknown scopes and quotes not found in the posting are dropped. Posting text is normalized with headings in uppercase, and quotes are compared case- and whitespace-insensitively, so the banner can show an uppercase quote. The classifier sees at most 40,000 characters.
- Authorization is **never auto-answered "No"** (a contractor abroad often cannot truthfully say Yes, and an automatic No can disqualify them). A work-authorization or sponsorship question that names no country stays manual: the GitLab question above is left to the user. Consent, EEO and personal questions are filled only from an explicit profile choice.
- Dropdown answers are validated against the job's real options; free-form options are never selected; cover letters use a text alternative or produce an editable `cover-letter.txt`. Reused answers are skipped if they name another company.
- Known limitations: regions EUROPE, EMEA, LATAM and APAC are treated as fuzzy, so a US resident on an EMEA-only posting gets "unclear", not "blocked". EOR routes in the profile are stored but ignored by the check and the resolver. "Where in EMEA are you currently based?" is not filled from the profile (EMEA is not recognized as a named place in question text).

**Trade-offs.** One model call per import reads the posting (cost); the result is cached in memory for an hour (200 entries, lost on restart). Quote verification trades recall for trust: a real claim quoted imprecisely is dropped. Structured-output validation cannot guarantee factual accuracy, so drafts need review.

**Planned** ([roadmap](docs/ROADMAP.md), Step 0 and A): running the prompts against ~15 real postings, a per-region borderline list, EOR semantics, a database-backed posting cache and per-user LLM limits, and automatic discovery of jobs (today the user pastes every URL). Only Greenhouse is supported; Ashby and Lever are Step D.

**Setup and tests.** Uses the same `OPENAI_API_KEY` and `OPENAI_MODEL`; no worker. `GET /api/jobs/answers` lists the user's completed CVs. `pnpm test:greenhouse` (offline URL, normalization and errors), `pnpm test:job-answers` (mocked AI), `pnpm test:step1` (eligibility, quote verification, memory, regenerate).

### 3. Sending an application

**Purpose.** Submit the reviewed answers and files to the employer's Greenhouse form from the user's own computer, and keep an exact record of what was sent.

**How it works** (implemented)

1. Review the answers and attachments, tick "I've reviewed…", and click **Apply**. `POST /api/submissions` accepts multipart data (`application` JSON ≤512 KB plus `file:<fieldId>` parts; ≤10 MB each, ≤20 MB total; pdf, doc, docx, txt, rtf).
2. The server reuses an existing non-failed submission for the same user and URL, re-fetches the live form, and runs `validateSubmission` (required answers, option values, form unchanged, CV ownership). In one transaction it saves the immutable snapshot (`submission`), the file bytes (`submission_file`), and the approved long answers (feeding **Saved answers**). Response: `202`.
3. The submission worker (`pnpm worker:submission`) dispatches rows into pg-boss (`retryLimit: 0`) and claims one atomically (`queued → processing`). `submitInBrowser` re-checks the live form, opens a **visible** Chromium (page navigations limited to Greenhouse hosts), fills the fields, uploads files, and clicks Submit once.
4. The page polls every 2 s. Only a visible confirmation marks it **submitted**. The saved application, its form and its files appear under **Applications** (`/app/applications`, `/app/applications/:id`).

**Example** (real `validateSubmission` on the test fixture. Browser filling and the queue are covered by `pnpm test:submission` and `pnpm test:submission-queue`; nothing was sent to an employer)

```text
valid answers + resume file   → ok
no resume attached            → 400 Please complete: Resume.
consent unchecked             → 400 Please complete: Consent.
option not on the form        → 409 An option changed for Language.
free-form option, no text     → 400 Please specify your answer for Language.
employer changed the form     → 409 The application questions changed. Reload the job and review your answers.

statuses: queued → processing → needs_input ⇄ submitting → submitted | needs_verification | failed
```

**Code map**

| Step | Where |
|---|---|
| Apply UI and status polling | [app/components/submission.tsx](app/components/submission.tsx): `SubmissionPanel` |
| Create and read submissions | [app/api/submissions/route.ts](app/api/submissions/route.ts) |
| Validation against the live form | [lib/submissions/validate.ts](lib/submissions/validate.ts): `validateSubmission` |
| Queue, claim, reconcile | [lib/submissions/processing.ts](lib/submissions/processing.ts): `dispatchSubmissions`, `processSubmission`, `reconcileSubmissions`; [workers/submission-worker.ts](workers/submission-worker.ts) |
| Browser automation | [lib/submissions/browser.ts](lib/submissions/browser.ts): `submitInBrowser`, `fillApplication`, `finishApplication`, `isConfirmed` |
| Types and statuses | [lib/submissions/types.ts](lib/submissions/types.ts) |
| Saved applications | [app/app/applications/page.tsx](app/app/applications/page.tsx), [app/app/applications/[id]/page.tsx](app/app/applications/[id]/page.tsx), [lib/applications/data.ts](lib/applications/data.ts), [app/api/applications/[id]/files/[fileId]/route.ts](app/api/applications/[id]/files/[fileId]/route.ts) |
| Remembering approved answers | [lib/answers/memory.ts](lib/answers/memory.ts): `saveApprovedAnswers` |

**Edge cases and failure handling**

- The employer changed the form since import: `409`, reload and review again. A missing required answer, invalid option or free-form option without text: `400`.
- CAPTCHA, location autocomplete (`location_needs_selection`), free-form options, or any field the worker cannot fill: status **needs input**, and the browser stays open for five minutes so the user can finish and submit there. The app never solves or bypasses CAPTCHA.
- No visible confirmation, a closed browser, a timeout or a worker crash after starting: **needs verification**. There are **no automatic retries** and no retry for uncertain or successful applications. Check the employer's confirmation email before doing anything else.
- A failure before the browser opens (job unreachable, Chromium missing): **failed**, and Apply can be retried. Duplicate Apply requests reuse the saved submission. `reconcileSubmissions` repairs jobs lost by the queue.
- Confirmation is detected from headings and known containers (`isConfirmed`), so an unusual confirmation page ends as **needs verification** instead of guessing.
- Attachments are limited to 10 MB each and 20 MB total; later edits on the page never change a queued application.

**Trade-offs.** The worker runs on the user's desktop, one visible browser at a time: it is not a hosted service and does not scale to many users. Approved answers are remembered when **Apply** is accepted, not when Greenhouse confirms, so a failed submission still leaves saved answers. Reloading a job restores its status but not the editable draft. No live employer submission has been part of the automated tests.

**Planned** ([roadmap](docs/ROADMAP.md)): one real end-to-end submit and better location handling (Step 0), a background review queue (Step B), more ATSs and the choice between a hosted worker and a browser extension for a paid product (Step D).

**Setup.** Install the browser, apply migrations, and start the visible worker, with `pnpm dev` running separately (the CV worker is only for parsing):

```bash
pnpm exec playwright install chromium
pnpm db:migrate
pnpm worker:submission
```

Endpoints: `POST /api/submissions`, `GET /api/submissions?url=...` (latest status for the owner). No Greenhouse credentials are needed. Verification never submits to employers: `pnpm test:submission` (local synthetic form, including PDF upload) and `pnpm test:submission-queue` (creates and drops a temporary database).

### Profile and saved answers

The **Profile** page stores facts a CV can't show: where you live, citizenships, where you can work and how (employee, employee needing sponsorship, B2B contractor, EOR), pay, start date, links, projects, and EEO and consent choices. It saves automatically as you edit. Matching questions are filled from it and never guessed; anything it doesn't state stays yours to answer.

Long answers you approve when applying are kept under **Saved answers** (`/app/answers`, deletable). They're used as voice examples for cover letters and "why us" answers, and company-neutral answers are reused as they are. The Apply page shows a setup checklist until a PDF CV is read and the profile says where you work. Tests: `pnpm test:profile`, `pnpm test:step1`.

### Development server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
