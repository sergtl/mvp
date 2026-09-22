import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { answerMemory } from "../db/schema";
import type { SubmissionFile, SubmissionInput } from "../submissions/types";
import { memoryFromSubmission, type MemoryEntry } from "./plan";

type Executor = Pick<typeof db, "insert">;

export async function saveApprovedAnswers(
  executor: Executor,
  userId: string,
  input: SubmissionInput,
  files: SubmissionFile[],
) {
  const rows = memoryFromSubmission(input, files);

  if (!rows.length) return;

  await executor
    .insert(answerMemory)
    .values(rows.map((row) => ({ ...row, userId })))
    .onConflictDoUpdate({
      target: [answerMemory.userId, answerMemory.questionKey, answerMemory.sourceURL],
      set: {
        answer: sqlExcluded("answer"),
        question: sqlExcluded("question"),
        kind: sqlExcluded("kind"),
        company: sqlExcluded("company"),
        jobTitle: sqlExcluded("job_title"),
        createdAt: new Date(),
      },
    });
}

const sqlExcluded = (column: string) => sql.raw(`excluded."${column}"`);

// Newest first.
export async function loadMemory(userId: string, limit = 200) {
  return (await db
    .select()
    .from(answerMemory)
    .where(eq(answerMemory.userId, userId))
    .orderBy(desc(answerMemory.createdAt))
    .limit(limit)) as MemoryEntry[];
}

