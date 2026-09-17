import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { submission, submissionFile } from "@/lib/db/schema";

export async function listApplications(userId: string) {
  return db
    .select({
      id: submission.id,
      title: sql<string>`${submission.snapshot}->'job'->>'title'`,
      company: sql<string>`${submission.snapshot}->'job'->>'company'`,
      sourceURL: submission.sourceURL,
      status: submission.status,
    })
    .from(submission)
    .where(eq(submission.userId, userId))
    .orderBy(desc(submission.createdAt));
}

export async function getApplication(userId: string, id: string) {
  const [record] = await db
    .select()
    .from(submission)
    .where(and(eq(submission.id, id), eq(submission.userId, userId)));

  if (!record) return null;

  const files = await db
    .select({
      id: submissionFile.id,
      fieldId: submissionFile.fieldId,
      filename: submissionFile.filename,
    })
    .from(submissionFile)
    .where(eq(submissionFile.submissionId, id));

  return { ...record, files };
}

export async function getApplicationFile(
  userId: string,
  id: string,
  fileId: string,
) {
  const [file] = await db
    .select({
      filename: submissionFile.filename,
      content: submissionFile.content,
    })
    .from(submissionFile)
    .innerJoin(submission, eq(submission.id, submissionFile.submissionId))
    .where(
      and(
        eq(submission.userId, userId),
        eq(submission.id, id),
        eq(submissionFile.id, fileId),
      ),
    );

  return file ?? null;
}
