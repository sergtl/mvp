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

Better Auth handles registration, sign-in, sessions, and sign-out on the home page.
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

### CV uploads

After signing in, use **Upload CV** on the home page. PDF and DOCX files up to
10 MB are supported. Uploaded filenames link to private downloads.

Apply migrations with `pnpm db:migrate` before using uploads. The `cv` table
stores metadata and a foreign key to the Better Auth user. `cv_file` stores
the original bytes in a PostgreSQL `bytea` column. Both records are created in
one transaction, and deleting a user cascades to their CVs and file contents.
Each user can have multiple CVs; uploading another file does not replace one.

Endpoints require a session:

- `GET /api/cvs`: current user's CV metadata, without file contents.
- `POST /api/cvs`: raw file body, with a URL-encoded filename in `X-File-Name`
  and a same-origin `Origin` header. Ownership comes from the session.
- `GET /api/cvs/:id`: attachment download, restricted to the owner.

The server enforces the size limit while reading the body and checks PDF
signatures or the DOCX ZIP directory. These checks are not full document
validation or malware scanning. Parsing is supported for PDFs only.
File contents are included in database backups; ensure the deployment's HTTP
body-size limit allows 10 MB uploads.

With the local app and Compose database running, `pnpm test:cv` checks uploads,
byte-for-byte downloads, ownership isolation, invalid files, size limits, and
cleanup via cascading deletes. Temporary test accounts and CVs are removed.

### PDF parsing worker

Add these server-side settings to `.env.local` (never use a `NEXT_PUBLIC_` prefix):

```dotenv
OPENAI_API_KEY=<your-openai-api-key>
OPENAI_MODEL=gpt-4.1-mini
```

Run `pnpm db:migrate`, then run `pnpm dev` and `pnpm worker` in separate terminals.
The worker loads `.env.local`, then `.env`, without overriding exported environment
variables. It requires Node.js 22.12+ (Node.js 24 recommended) and access to the same
PostgreSQL database as the web app. In deployment, run `pnpm worker` as a separate,
long-lived service with automatic restart, from the repository root. Keep `tsx`,
`workers/`, and the application's dependencies available in its deployment.

New PDF uploads automatically create a queued `cv_parse` row in the file-save
transaction. Older PDFs have a **Parse CV** button. The worker dispatches queued
rows into pg-boss every three seconds, storing each job ID in the same database
transaction as job creation. pg-boss creates its own schema on worker startup;
the database role must have permission to create it. The web app can accept
uploads while the worker is offline. DOCX files remain downloadable but are not
parsed.

One worker processes one CV at a time. PDF extraction runs in a separate process
with a 30-second timeout, 256 MB Node heap limit, 30-page limit, and 100,000-character
text limit. PDFs with too little text are marked `needs_ocr`; OCR is not included.
The text is sent to OpenAI's Responses API using Structured Outputs and validated
with Zod. The original PDF is not sent. Requests use `store: false`; this setting
does not itself guarantee zero data retention by the provider.

Transient AI errors retry up to twice with backoff. Extracted text is reused for
retries. Successful attempts are not reprocessed, and corrections are stored
separately in `cv_review`. A crash after an OpenAI response but before the database
commit can cause a repeated API call on retry; database writes remain idempotent.
Queue failures after exhausted retries are reconciled to a visible failure status.

The home page polls while parsing is queued or running, then offers **Review
extracted CV**. Users can edit contact details, summary, experience, education,
skills, and languages, inspect the extracted text, and save corrections. Parsing
and review endpoints check ownership and mutation origins.

- `GET /api/cvs/:id/parse`: latest attempt and saved review.
- `POST /api/cvs/:id/parse`: start or retry parsing; active and completed attempts
  are reused to avoid duplicate work.
- `PUT /api/cvs/:id/review`: validate and save user corrections.

Tests (no OpenAI key or paid API calls required):

```bash
pnpm test:parsing       # isolated temporary local DB, real PDF parsing, stubbed AI
pnpm test:parsing-api   # requires localhost:3000 and the local Compose DB
pnpm test:cv-ai         # OpenAI SDK behavior with a mocked HTTP transport
```

The worker test creates and drops its own temporary database. API tests create
and remove temporary users and CVs. These tests do not measure model extraction
accuracy; evaluate that separately against representative CVs before relying on
unreviewed results.

### Greenhouse job import

After signing in, paste a direct Greenhouse job URL into **Job application** and
click **Load job**. The app displays the description and editable application,
location, equal opportunity, demographic, and applicable consent questions.
File/text alternatives and single/multiple choice fields retain Greenhouse's
options and required flags. **Check required fields** validates visible answers.

This first version keeps answers and selected files in page memory only; it does
not save or submit applications. Hidden location coordinates are retained as
empty fields; geocoding is not implemented. Unsupported field types are visibly
flagged for completion on the original posting. Custom company career domains
and shortened links are not supported; use the direct Greenhouse posting URL.

`GET /api/jobs/greenhouse?url=...` requires a session and reads Greenhouse's public
Job Board API with `questions=true`. It needs no API key, migration, or worker.
The server only requests fixed Greenhouse API hosts and rejects redirects.
Descriptions are converted to plain text before rendering.

Run `pnpm test:greenhouse` for offline URL, response normalization, and error tests.

#### Generate application answers

Choose a parsed CV below the job description and click **Generate answers**.
The authenticated `POST /api/jobs/answers` endpoint loads that user's CV from the
database, preferring saved review corrections, and calls OpenAI with the job and
required questions. Optional cover-letter and motivation questions are included.
It uses the same `OPENAI_API_KEY` and `OPENAI_MODEL` as CV parsing, but runs in the
web process (up to 60 seconds for the AI request), so the worker is not required.

Drafts fill empty questions only. Dropdown values are checked against the job's
actual options. Personal decisions, consent, unsupported inputs and questions
without enough CV information remain for the applicant to answer. Cover letters
use a text alternative when available; file-only cover letters produce an editable
`cover-letter.txt` file. Generation also attaches the selected CV's original PDF
to empty resume file inputs. **Attach selected CV PDF** attaches or replaces the
resume without calling AI. Existing uploads are preserved during generation.
The draft holds the actual PDF File and a reference containing its saved CV ID,
filename, and Greenhouse field name for the future Apply step. Manual file
replacement clears that saved reference. Downloading the PDF uses the existing
owner-checked endpoint; a future submission endpoint must check ownership again.
Answers remain in page memory and are not submitted or persisted. Review generated
claims and wording: structured output validation cannot guarantee factual accuracy.

`GET /api/jobs/answers` lists only the current user's completed CVs. Use **Refresh
CVs** after a new CV finishes parsing. Run `pnpm test:job-answers` for offline
generation, field mapping and edit-preservation tests with a mocked AI transport.

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

### Greenhouse submission (local MVP)

Install the browser and apply migrations, then start the visible submission worker:

```bash
pnpm exec playwright install chromium
pnpm db:migrate
pnpm worker:submission
```

Keep `pnpm dev` running separately. The CV worker is only needed for CV parsing.
Run one submission worker on your local desktop: it opens Chromium on that
computer, not in the web user's browser. This version is not a remote browser
service for deployed multi-user applications.

After loading a job, review the answers and attachments, check the review box,
and click **Apply**. The API checks the live question set, required answers,
option values and CV ownership, then saves a snapshot plus file bytes in
`submission` and `submission_file`. Saved CV references resolve to their original
bytes; manually attached files and generated cover letters are saved too.
Attachments are limited to 10 MB each and 20 MB total. Later edits on the page do
not change a queued application.

The worker dispatches rows transactionally into pg-boss and handles one at a time.
It fills the live Greenhouse controls, uploads the attachments, and clicks Submit
once. If the site needs CAPTCHA, location selection, a custom/free-form field, or
other manual help, the app shows **needs input** and leaves the visible browser
open for five minutes. Finish those fields and submit there; leave the window open
until the worker sees confirmation. It does not solve or bypass CAPTCHA.

Only a visible confirmation marks a submission as **submitted**. If the browser
closes, times out, or the worker crashes after starting, the result becomes
**needs verification**. Check the employer's confirmation/email before taking any
further action. There are no automatic retries and no retry button for uncertain
or successful applications. Duplicate Apply requests reuse the saved submission;
a failure before opening the browser can be retried. Reloading a job restores its
latest submission status. Inputs remain local drafts; reopening the page does not
restore the editable answers from a queued snapshot.

Endpoints: authenticated `POST /api/submissions` accepts multipart application
JSON and files; `GET /api/submissions?url=...` returns only the owner's latest
status. No Greenhouse API credentials are needed for the browser submission.

Verification (never submits applications to employers):

```bash
pnpm test:submission       # local synthetic browser form, including PDF upload
pnpm test:submission-queue # isolated temporary DB, mocked browser and job API
```

The second test creates and drops its own database using the configured database
credentials. Production form variations can still require manual completion;
there has been no live employer submission as part of these tests.
