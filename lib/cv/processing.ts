import { and, eq, inArray } from "drizzle-orm";
import type { JobWithMetadata, PgBoss } from "pg-boss";
import { db, pool } from "../db";
import { cvFile, cvParse } from "../db/schema";
import { extractWithAI, ParseFailure, parsingModel } from "./ai";
import { extractPDF } from "./pdf-text";
import { extractedCVSchema, type ExtractedCV } from "./extraction-schema";

export const PARSE_QUEUE = "cv-parse";
export type ParseJob = { parseId: string };

export async function dispatchPending(boss: PgBoss) {
  // The parse row is a transactional outbox: uploading never depends on a
  // running worker. Sending the job and storing its ID commit together.
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pending = await client.query<{ id: string }>(
      "SELECT id FROM cv_parse WHERE status = 'queued' AND job_id IS NULL ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED",
    );

    for (const row of pending.rows) {
      const jobId = await boss.send(
        PARSE_QUEUE,
        { parseId: row.id },
        {
          db: { executeSql: (text, values) => client.query(text, values) },
          retryLimit: 2,
          retryDelay: 10,
          retryBackoff: true,
          expireInSeconds: 180,
        },
      );

      if (!jobId) throw new Error("Unable to enqueue parse");

      await client.query("UPDATE cv_parse SET job_id = $1 WHERE id = $2", [
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

export async function processParseJob(
  job: JobWithMetadata<ParseJob>,
  dependencies: {
    extractPDF: (content: Buffer) => Promise<string>;
    extractAI: (text: string) => Promise<ExtractedCV>;
  } = { extractPDF, extractAI: extractWithAI },
) {
  const [attempt] = await db
    .select()
    .from(cvParse)
    .where(eq(cvParse.id, job.data.parseId));

  if (!attempt || !["queued", "processing"].includes(attempt.status)) return;

  const active = and(
    eq(cvParse.id, attempt.id),
    inArray(cvParse.status, ["queued", "processing"]),
  );

  await db
    .update(cvParse)
    .set({ status: "processing", errorCode: null, model: parsingModel() })
    .where(active);

  try {
    let text = attempt.rawText;

    if (!text) {
      const [file] = await db
        .select()
        .from(cvFile)
        .where(eq(cvFile.cvId, attempt.cvId));

      if (!file) return; // The owner may have deleted their account.

      text = await dependencies.extractPDF(file.content);

      await db.update(cvParse).set({ rawText: text }).where(active);
    }

    const data = extractedCVSchema.parse(await dependencies.extractAI(text));

    await db
      .update(cvParse)
      .set({
        status: "completed",
        extractedData: data,
        completedAt: new Date(),
        errorCode: null,
      })
      .where(active);
  } catch (error) {
    const failure =
      error instanceof ParseFailure
        ? error
        : new ParseFailure("worker_failed", true);

    const retry = failure.retryable && job.retryCount < job.retryLimit;

    await db
      .update(cvParse)
      .set({
        status: retry
          ? "queued"
          : failure.code === "needs_ocr"
            ? "needs_ocr"
            : "failed",
        errorCode: failure.code,
        completedAt: retry ? null : new Date(),
      })
      .where(active);

    if (retry) throw new Error(failure.code);
  }
}

export async function reconcileFailedJobs(boss: PgBoss) {
  const attempts = await db
    .select({ id: cvParse.id, jobId: cvParse.jobId })
    .from(cvParse)
    .where(inArray(cvParse.status, ["queued", "processing"]));

  for (const attempt of attempts) {
    if (!attempt.jobId) continue;

    const job = await boss.getJobById(PARSE_QUEUE, attempt.jobId);

    if (!job || ["failed", "cancelled"].includes(job.state)) {
      await db
        .update(cvParse)
        .set({
          status: "failed",
          errorCode: "worker_failed",
          completedAt: new Date(),
        })
        .where(
          and(
            eq(cvParse.id, attempt.id),
            inArray(cvParse.status, ["queued", "processing"]),
          ),
        );
    }
  }
}
