import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Pool } from "pg";
import { fixture } from "./submission.test";

async function main() {
  config({ path: ".env.local", quiet: true });
  // Isolated database, never dispatch jobs from the user's live queue.
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = `submission_test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  const { db, pool } = await import("../lib/db");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { PgBoss } = await import("pg-boss");
  const { submission, submissionFile, user } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { dispatchSubmissions, processSubmission, reconcileSubmissions, SUBMISSION_QUEUE } = await import("../lib/submissions/processing");
  const { BrowserNotStarted } = await import("../lib/submissions/browser");
  const boss = new PgBoss(process.env.DATABASE_URL!);
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    await boss.start();
    await boss.createQueue(SUBMISSION_QUEUE);
    const ownerId = randomUUID();
    await db.insert(user).values({ id: ownerId, name: "Submission Test", email: `${ownerId}@example.invalid` });
    const [record] = await db.insert(submission).values({ userId: ownerId, sourceURL: fixture.job.sourceURL, snapshot: fixture }).returning();
    const bytes = Buffer.from("%PDF synthetic original");
    await db.insert(submissionFile).values({ submissionId: record.id, fieldId: "0-2-0", filename: "cv.pdf", contentType: "application/pdf", content: bytes });
    const duplicate = await db.insert(submission).values({ userId: ownerId, sourceURL: fixture.job.sourceURL, snapshot: fixture }).onConflictDoNothing().returning();
    assert.equal(duplicate.length, 0);
    await Promise.all([dispatchSubmissions(boss), dispatchSubmissions(boss)]);
    const [queued] = await db.select().from(submission).where(eq(submission.id, record.id));
    assert(queued.jobId);
    const job = await boss.getJobById(SUBMISSION_QUEUE, queued.jobId);
    assert.equal(job?.retryLimit, 0);
    let runs = 0;
    const fake = async (_snapshot: typeof fixture, files: { content: Buffer }[], progress: (status: "submitting", message: string) => Promise<void>) => {
      runs++;
      assert.deepEqual(files[0].content, bytes);
      await progress("submitting", "Fixture submit");
      return "submitted" as const;
    };
    await Promise.all([processSubmission(record.id, fake), processSubmission(record.id, fake)]);
    assert.equal(runs, 1);
    await processSubmission(record.id, fake);
    assert.equal(runs, 1);
    assert.equal((await db.select().from(submission).where(eq(submission.id, record.id)))[0].status, "submitted");

    const create = async (suffix: string) => (await db.insert(submission).values({ userId: ownerId, sourceURL: `${fixture.job.sourceURL}${suffix}`, snapshot: fixture }).returning())[0];
    const interrupted = await create("2");
    await processSubmission(interrupted.id, async () => { throw new Error("Connection lost after click"); });
    assert.equal((await db.select().from(submission).where(eq(submission.id, interrupted.id)))[0].status, "needs_verification");
    const notStarted = await create("3");
    await processSubmission(notStarted.id, async () => { throw new BrowserNotStarted("Chromium missing"); });
    assert.equal((await db.select().from(submission).where(eq(submission.id, notStarted.id)))[0].status, "failed");
    const crashed = await create("4");
    await dispatchSubmissions(boss);
    const [crashedJob] = await db.select().from(submission).where(eq(submission.id, crashed.id));
    await db.update(submission).set({ status: "submitting" }).where(eq(submission.id, crashed.id));
    await boss.cancel(SUBMISSION_QUEUE, crashedJob.jobId!);
    await reconcileSubmissions(boss);
    assert.equal((await db.select().from(submission).where(eq(submission.id, crashed.id)))[0].status, "needs_verification");
    // Exercise authenticated route handlers against the same isolated database.
    const { auth } = await import("../auth");
    const { GET, POST } = await import("../app/api/submissions/route");
    const { cv, cvFile } = await import("../lib/db/schema");
    const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
    const signup = async () => {
      const response = await auth.handler(new Request(`${origin}/api/auth/sign-up/email`, {
        method: "POST", headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ name: "Fixture", email: `${randomUUID()}@example.com`, password: `${randomUUID()}Aa!` }),
      }));
      assert.equal(response.status, 200);
      return { cookie: response.headers.getSetCookie().map(c => c.split(";")[0]).join("; "), user: (await response.json()).user };
    };
    const owner = await signup();
    const other = await signup();
    const [savedCV] = await db.insert(cv).values({ userId: owner.user.id, filename: "owned.pdf", contentType: "application/pdf", sizeBytes: bytes.length }).returning();
    await db.insert(cvFile).values({ cvId: savedCV.id, content: bytes });
    const { normalizeJob } = await import("../lib/jobs/greenhouse");
    const payload = { id: 1, title: fixture.job.title, company_name: fixture.job.company,
      content: fixture.job.description, location: { name: fixture.job.location },
      questions: fixture.job.sections[0].questions.map(q => ({ ...q, fields: q.fields.map(f => ({ name: f.name, type: f.type, values: f.options })) })),
    };
    const input = { ...fixture, job: normalizeJob(payload, fixture.job.sourceURL), attachments: { "0-2-0": { cvId: savedCV.id } } };
    const makeRequest = (cookie: string, requestOrigin = origin) => {
      const body = new FormData();
      body.append("application", JSON.stringify(input));
      return new Request(`${origin}/api/submissions`, { method: "POST", headers: { cookie, origin: requestOrigin }, body });
    };
    assert.equal((await POST(makeRequest(""))).status, 401);
    assert.equal((await POST(makeRequest(owner.cookie, "https://untrusted.example"))).status, 403);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.match(String(url), /^https:\/\/boards-api.greenhouse.io\/v1\/boards\/fixture\/jobs\/1/);
      return Response.json(payload);
    };
    try {
      assert.equal((await POST(makeRequest(other.cookie))).status, 404, "Foreign CV references must be rejected");
      const created = await POST(makeRequest(owner.cookie));
      assert.equal(created.status, 202);
      const { submission: createdRecord } = await created.json();
      assert(createdRecord.id);
      const duplicate = await POST(makeRequest(owner.cookie));
      assert.equal((await duplicate.json()).submission.id, createdRecord.id);
      const query = `${origin}/api/submissions?${new URLSearchParams({ url: fixture.job.sourceURL })}`;
      assert.equal((await GET(new Request(query))).status, 401);
      assert.equal((await (await GET(new Request(query, { headers: { cookie: other.cookie } }))).json()).submission, null);
      assert.equal((await (await GET(new Request(query, { headers: { cookie: owner.cookie } }))).json()).submission.id, createdRecord.id);
      const [storedFile] = await db.select().from(submissionFile).where(eq(submissionFile.submissionId, createdRecord.id));
      assert.deepEqual(storedFile.content, bytes);
      assert.equal(storedFile.filename, "owned.pdf");
      const [stored] = await db.select().from(submission).where(eq(submission.id, createdRecord.id));
      assert.deepEqual(stored.snapshot.answers, fixture.answers);
    } finally { globalThis.fetch = originalFetch; }
    console.log("PASS: authenticated API, origin protection, CV ownership, isolated status, immutable answer/file snapshot, and repeated Apply requests.");
    console.log("PASS: transactional dispatch, duplicate suppression, single claim, original file bytes, no retry after submit, startup failure, and crash reconciliation.");
  } finally {
    await boss.stop();
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Queue test failed"); process.exitCode = 1; });
