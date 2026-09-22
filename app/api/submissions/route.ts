import { auth } from "@/auth";
import { saveApprovedAnswers } from "@/lib/answers/memory";
import { db } from "@/lib/db";
import { cv, cvFile, submission, submissionFile } from "@/lib/db/schema";
import {
  fetchGreenhouseJob,
  JobImportError,
  parseGreenhouseURL,
} from "@/lib/jobs/greenhouse";
import { submissionInput, type SubmissionFile } from "@/lib/submissions/types";
import {
  SubmissionError,
  validateSubmission,
} from "@/lib/submissions/validate";
import { and, desc, eq, ne } from "drizzle-orm";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

const publicColumns = {
  id: submission.id,
  status: submission.status,
  message: submission.message,
  createdAt: submission.createdAt,
};

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json(
      { error: "Sign in to view applications." },
      { status: 401 },
    );

  try {
    const sourceURL = parseGreenhouseURL(
      new URL(request.url).searchParams.get("url") ?? "",
    ).sourceURL;

    const [record] = await db
      .select(publicColumns)
      .from(submission)
      .where(
        and(
          eq(submission.userId, session.user.id),
          eq(submission.sourceURL, sourceURL),
        ),
      )
      .orderBy(desc(submission.createdAt))
      .limit(1);

    return Response.json({ submission: record ?? null }, { headers });
  } catch (error) {
    if (error instanceof JobImportError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );

    return Response.json(
      { error: "Unable to load application status." },
      { status: 500, headers },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json({ error: "Sign in to apply." }, { status: 401 });

  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL ?? request.url).origin
  )
    return Response.json({ error: "Invalid request origin." }, { status: 403 });

  try {
    // Bound multipart data before decoding it (20 MB including all attachments).
    const reader = request.body?.getReader();
    if (!reader) throw new SubmissionError("Missing application.");

    const chunks: Uint8Array[] = [];

    let size = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        size += value.length;

        if (size > 20 * 1024 * 1024) {
          await reader.cancel();
          throw new SubmissionError(
            "Application attachments exceed 20 MB.",
            413,
          );
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let form: FormData;

    try {
      form = await new Response(Buffer.concat(chunks), {
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch {
      throw new SubmissionError("Invalid application upload.");
    }

    const raw = form.get("application");

    if (typeof raw !== "string" || raw.length > 512 * 1024)
      throw new SubmissionError("Invalid application details.");

    let parsed;

    try {
      parsed = submissionInput.safeParse(JSON.parse(raw));
    } catch {
      throw new SubmissionError("Invalid application details.");
    }

    if (!parsed.success)
      throw new SubmissionError("Check the application fields.");

    const input = parsed.data;
    const sourceURL = parseGreenhouseURL(input.job.sourceURL).sourceURL;
    // Repeated clicks and reloads reuse the original attempt, including uncertain results.
    const existing = await db
      .select(publicColumns)
      .from(submission)
      .where(
        and(
          eq(submission.userId, session.user.id),
          eq(submission.sourceURL, sourceURL),
          ne(submission.status, "failed"),
        ),
      )
      .limit(1);

    if (existing[0])
      return Response.json({ submission: existing[0] }, { headers });

    const live = await fetchGreenhouseJob(sourceURL);

    const files: SubmissionFile[] = [];

    for (const [fieldId, reference] of Object.entries(input.attachments)) {
      const [saved] = await db
        .select({
          filename: cv.filename,
          contentType: cv.contentType,
          content: cvFile.content,
        })
        .from(cv)
        .innerJoin(cvFile, eq(cv.id, cvFile.cvId))
        .where(and(eq(cv.id, reference.cvId), eq(cv.userId, session.user.id)));

      if (!saved)
        throw new SubmissionError(
          "An attached CV is no longer available.",
          404,
        );
      files.push({ ...saved, fieldId });
    }

    for (const [key, value] of form.entries()) {
      if (key === "application") continue;
      if (!key.startsWith("file:") || typeof value === "string")
        throw new SubmissionError("Invalid attachment.");

      const fieldId = key.slice(5);

      if (
        !value.size ||
        value.size > 10 * 1024 * 1024 ||
        files.some((f) => f.fieldId === fieldId)
      )
        throw new SubmissionError(
          "Each attachment must be unique and between 1 byte and 10 MB.",
        );

      if (!/\.(pdf|docx?|txt|rtf)$/i.test(value.name))
        throw new SubmissionError("Use PDF, Word, TXT or RTF attachments.");

      files.push({
        fieldId,
        filename: value.name,
        contentType: value.type || "application/octet-stream",
        content: Buffer.from(await value.arrayBuffer()),
      });
    }

    if (
      files.reduce((n, file) => n + file.content.length, 0) >
      20 * 1024 * 1024
    )
      throw new SubmissionError("Application attachments exceed 20 MB.", 413);

    validateSubmission(input, live, new Set(files.map((file) => file.fieldId)));

    const result = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(submission)
        .values({
          userId: session.user.id,
          sourceURL,
          snapshot: { ...input, job: live },
        })
        .onConflictDoNothing()
        .returning(publicColumns);

      if (!record) {
        const [previous] = await tx
          .select(publicColumns)
          .from(submission)
          .where(
            and(
              eq(submission.userId, session.user.id),
              eq(submission.sourceURL, sourceURL),
              ne(submission.status, "failed"),
            ),
          )
          .limit(1);

        return previous;
      }

      if (files.length)
        await tx
          .insert(submissionFile)
          .values(files.map((file) => ({ ...file, submissionId: record.id })));

      // Remember what the user approved, to draft future answers in their voice.
      await saveApprovedAnswers(tx, session.user.id, { ...input, job: live }, files);
      return record;
    });

    return Response.json({ submission: result }, { status: 202, headers });
  } catch (error) {
    if (error instanceof SubmissionError || error instanceof JobImportError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );

    console.error(
      "Submission creation failed",
      error instanceof Error ? error.name : "UnknownError",
    );

    return Response.json(
      { error: "Unable to queue this application. Please try again." },
      { status: 500, headers },
    );
  }
}
