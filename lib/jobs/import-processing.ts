import { and, eq, inArray } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { db, pool } from "../db";
import { jobImport } from "../db/schema";
import { resolveAts } from "./ats-adapter";

// Ashby/Lever's fetchForm needs a real browser and real wall-clock time (a
// JS-rendered form, a network-idle wait) - not something to hold a Next.js
// request open for. Same dispatch/reconcile/tick shape as lib/cv/processing.ts
// and lib/submissions/processing.ts, run by the same worker process that
// already launches Playwright for submissions (workers/submission-worker.ts).
export const IMPORT_QUEUE = "job-import";

export async function dispatchImports(boss: PgBoss) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pending = await client.query<{ id: string }>(
      "SELECT id FROM job_import WHERE status = 'queued' AND job_id IS NULL ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED",
    );

    for (const row of pending.rows) {
      const jobId = await boss.send(
        IMPORT_QUEUE,
        { importId: row.id },
        {
          db: { executeSql: (text, values) => client.query(text, values) },
          retryLimit: 1,
          retryDelay: 10,
          expireInSeconds: 120,
        },
      );

      if (!jobId) throw new Error("Unable to enqueue import");

      await client.query("UPDATE job_import SET job_id = $1 WHERE id = $2", [jobId, row.id]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function processImport(id: string) {
  const [attempt] = await db.select().from(jobImport).where(eq(jobImport.id, id));
  if (!attempt || !["queued", "processing"].includes(attempt.status)) return;

  const active = and(eq(jobImport.id, attempt.id), inArray(jobImport.status, ["queued", "processing"]));

  await db.update(jobImport).set({ status: "processing" }).where(active);

  const resolved = resolveAts(attempt.sourceURL);

  // Greenhouse never reaches this queue (its route resolves inline); guard
  // rather than assume, in case a stale/mis-typed row ever lands here.
  if (!resolved || resolved.adapter.ats === "greenhouse") {
    await db
      .update(jobImport)
      .set({ status: "failed", errorCode: "unsupported_ats", completedAt: new Date() })
      .where(active);
    return;
  }

  try {
    // No `page`: fetchForm manages its own throwaway browser for this
    // standalone read, separate from the one submitInBrowser later opens.
    const job = await resolved.adapter.fetchForm(resolved.sourceURL);

    await db
      .update(jobImport)
      .set({ status: "completed", result: job, completedAt: new Date() })
      .where(active);
  } catch {
    await db
      .update(jobImport)
      .set({ status: "failed", errorCode: "fetch_failed", completedAt: new Date() })
      .where(active);
  }
}

export async function reconcileImports(boss: PgBoss) {
  const attempts = await db
    .select({ id: jobImport.id, jobId: jobImport.jobId })
    .from(jobImport)
    .where(inArray(jobImport.status, ["queued", "processing"]));

  for (const attempt of attempts) {
    if (!attempt.jobId) continue;

    const job = await boss.getJobById(IMPORT_QUEUE, attempt.jobId);

    if (!job || ["failed", "cancelled"].includes(job.state)) {
      await db
        .update(jobImport)
        .set({ status: "failed", errorCode: "worker_failed", completedAt: new Date() })
        .where(
          and(eq(jobImport.id, attempt.id), inArray(jobImport.status, ["queued", "processing"])),
        );
    }
  }
}
