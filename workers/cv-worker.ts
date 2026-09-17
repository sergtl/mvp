import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

function logQueueError(stage: string, error: unknown) {
  // Drizzle errors can include SQL parameters. Report the underlying error
  // type and database code without logging CV text or credentials.
  let cause = error;

  while (cause instanceof Error && cause.cause) cause = cause.cause;

  const code =
    cause && typeof cause === "object" && "code" in cause
      ? String(cause.code)
      : undefined;

  console.error(`CV ${stage} failed; will retry.`, {
    type: cause instanceof Error ? cause.name : "UnknownError",
    code,
    ...(code === "42P01" || code === "42703"
      ? {
          hint: "Run pnpm db:migrate against the worker's configured database.",
        }
      : {}),
  });
}

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL in .env.local.");

  if (!process.env.OPENAI_API_KEY)
    throw new Error("Set OPENAI_API_KEY in .env.local.");

  const { PgBoss } = await import("pg-boss");
  const { pool } = await import("../lib/db");

  const { PARSE_QUEUE, dispatchPending, processParseJob, reconcileFailedJobs } =
    await import("../lib/cv/processing");

  try {
    await pool.query("SELECT id, job_id, status FROM cv_parse LIMIT 0");
  } catch (error) {
    logQueueError("database check", error);
    await pool.end();
    throw new Error(
      "Worker database is not ready. Check DATABASE_URL and run pnpm db:migrate before starting the worker.",
    );
  }

  const boss = new PgBoss(process.env.DATABASE_URL);

  boss.on("error", (error) => logQueueError("queue", error));

  await boss.start();
  await boss.createQueue(PARSE_QUEUE);

  const options = {
    includeMetadata: true,
    localConcurrency: 1,
    batchSize: 1,
  } as const;

  await boss.work<{ parseId: string }, void, typeof options>(
    PARSE_QUEUE,
    options,
    async ([job]) => {
      await processParseJob(job);
    },
  );

  let ticking = false;

  async function tick() {
    if (ticking) return;
    ticking = true;
    let stage = "dispatch";
    try {
      await dispatchPending(boss);
      stage = "job reconciliation";
      await reconcileFailedJobs(boss);
    } catch (error) {
      logQueueError(stage, error);
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

    await boss.stop({ graceful: true, timeout: 120_000 });
    await pool.end();
  }

  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
  console.log("CV worker ready (one job at a time).");
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Worker startup failed.",
  );

  process.exitCode = 1;
});
