import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL in .env.local.");

  const { PgBoss } = await import("pg-boss");

  const { pool } = await import("../lib/db");

  const {
    SUBMISSION_QUEUE,
    dispatchSubmissions,
    processSubmission,
    reconcileSubmissions,
  } = await import("../lib/submissions/processing");

  try {
    await pool.query("SELECT id, snapshot FROM submission LIMIT 0");
  } catch {
    await pool.end();

    throw new Error(
      "Run pnpm db:migrate before starting the submission worker.",
    );
  }

  const boss = new PgBoss(process.env.DATABASE_URL);

  boss.on("error", () =>
    console.error("Submission queue error; check PostgreSQL connectivity."),
  );

  await boss.start();

  await boss.createQueue(SUBMISSION_QUEUE);

  await boss.work<{ submissionId: string }>(
    SUBMISSION_QUEUE,
    { localConcurrency: 1, batchSize: 1 },
    async ([job]) => {
      await processSubmission(job.data.submissionId);
    },
  );

  let ticking = false;

  async function tick() {
    if (ticking) return;

    ticking = true;

    try {
      await dispatchSubmissions(boss);
      await reconcileSubmissions(boss);
    } catch {
      console.error(
        "Submission dispatch failed; check PostgreSQL connectivity.",
      );
    } finally {
      ticking = false;
    }
  }

  await tick();

  const timer = setInterval(() => void tick(), 3000);

  let stopping = false;

  async function stop() {
    if (stopping) return;
    stopping = true;

    clearInterval(timer);

    await boss.stop({ graceful: true, timeout: 360000 });
    await pool.end();
  }

  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
  console.log(
    "Submission worker ready. One visible browser at a time; complete CAPTCHA in that window if needed.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Submission worker failed.",
  );
  process.exitCode = 1;
});
