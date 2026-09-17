import { and, eq, inArray } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { db, pool } from "../db";
import { submission, submissionFile } from "../db/schema";
import { activeStatuses, type SubmissionStatus } from "./types";
import { BrowserNotStarted, submitInBrowser } from "./browser";

export const SUBMISSION_QUEUE = "application-submit";

export async function dispatchSubmissions(boss: PgBoss) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const rows = await client.query<{ id: string }>(
      "SELECT id FROM submission WHERE status = 'queued' AND job_id IS NULL ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED",
    );

    for (const row of rows.rows) {
      const jobId = await boss.send(
        SUBMISSION_QUEUE,
        { submissionId: row.id },
        {
          db: { executeSql: (text, values) => client.query(text, values) },
          retryLimit: 0,
          expireInSeconds: 900,
        },
      );

      if (!jobId) throw new Error("enqueue_failed");

      await client.query("UPDATE submission SET job_id = $1 WHERE id = $2", [
        jobId,
        row.id,
      ]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
}

export async function processSubmission(id: string, run = submitInBrowser) {
  // Claim exactly once. Redelivery must never reopen a submitted/uncertain job.
  const [record] = await db
    .update(submission)
    .set({
      status: "processing",
      message: "Opening Greenhouse and filling your application…",
      updatedAt: new Date(),
    })
    .where(and(eq(submission.id, id), eq(submission.status, "queued")))
    .returning();

  if (!record) return;

  const files = await db
    .select()
    .from(submissionFile)
    .where(eq(submissionFile.submissionId, id));

  const progress = async (status: SubmissionStatus, message: string) => {
    const updated = await db
      .update(submission)
      .set({ status, message, updatedAt: new Date() })
      .where(
        and(eq(submission.id, id), inArray(submission.status, activeStatuses)),
      )
      .returning({ id: submission.id });
    if (!updated.length) throw new Error("submission_not_active");
  };

  try {
    const status = await run(record.snapshot, files, progress);

    await progress(
      status,
      status === "submitted"
        ? "Greenhouse confirmed your application was received."
        : "No confirmation was captured. Check Greenhouse or your email before applying again. We will not retry automatically.",
    );
  } catch (error) {
    if (error instanceof BrowserNotStarted) {
      await progress("failed", error.message);
      return;
    }
    // The browser may already have sent the form. Even a timeout is ambiguous.
    await progress(
      "needs_verification",
      "The browser stopped before a result was confirmed. Check Greenhouse or your email. This application will not be retried automatically.",
    );
  }
}

export async function reconcileSubmissions(boss: PgBoss) {
  const records = await db
    .select({
      id: submission.id,
      jobId: submission.jobId,
      status: submission.status,
    })
    .from(submission)
    .where(inArray(submission.status, activeStatuses));

  for (const record of records) {
    if (!record.jobId) continue;

    const job = await boss.getJobById(SUBMISSION_QUEUE, record.jobId);

    if (!job || ["failed", "cancelled", "completed"].includes(job.state)) {
      const notStarted = record.status === "queued";

      await db
        .update(submission)
        .set({
          status: notStarted ? "failed" : "needs_verification",
          message: notStarted
            ? "The submission worker did not start this application. You can try again."
            : "The worker was interrupted. Check Greenhouse or your email; we will not submit again automatically.",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(submission.id, record.id),
            eq(submission.status, record.status),
          ),
        );
    }
  }
}
