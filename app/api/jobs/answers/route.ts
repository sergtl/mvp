import OpenAI from "openai";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cv, cvParse, cvReview } from "@/lib/db/schema";
import { ownedCV } from "@/lib/cv/access";
import { extractedCVSchema } from "@/lib/cv/extraction-schema";
import { answerRequestSchema } from "@/lib/jobs/answers";
import { generateJobAnswers } from "@/lib/jobs/generate-answers";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 90;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json(
      { error: "Sign in to access your CVs." },
      { status: 401 },
    );

  const rows = await db
    .select({ id: cv.id, filename: cv.filename })
    .from(cv)
    .innerJoin(
      cvParse,
      and(eq(cvParse.cvId, cv.id), eq(cvParse.status, "completed")),
    )
    .where(eq(cv.userId, session.user.id))
    .orderBy(desc(cv.createdAt));

  return Response.json(
    { cvs: [...new Map(rows.map((row) => [row.id, row])).values()] },
    { headers },
  );
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json(
      { error: "Sign in to generate answers." },
      { status: 401 },
    );

  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL ?? request.url).origin
  )
    return Response.json({ error: "Invalid request origin." }, { status: 403 });

  const reader = request.body?.getReader();

  if (!reader)
    return Response.json({ error: "Missing application." }, { status: 400 });

  const chunks: Uint8Array[] = [];

  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 512 * 1024) {
        await reader.cancel();
        return Response.json(
          { error: "This application is too large to generate answers." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  let body;

  try {
    body = answerRequestSchema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    return Response.json({ error: "Invalid application." }, { status: 400 });
  }

  if (!body.success)
    return Response.json(
      { error: "Invalid application fields." },
      { status: 400 },
    );

  const access = await ownedCV(request, body.data.cvId, true);

  if (access.error) return access.error;

  const [parse] = await db
    .select({ data: cvParse.extractedData })
    .from(cvParse)
    .where(
      and(eq(cvParse.cvId, access.record.id), eq(cvParse.status, "completed")),
    )
    .orderBy(desc(cvParse.createdAt))
    .limit(1);

  const [review] = await db
    .select({ data: cvReview.data })
    .from(cvReview)
    .where(eq(cvReview.cvId, access.record.id));

  const parsed = extractedCVSchema.safeParse(review?.data ?? parse?.data);

  if (!parse || !parsed.success)
    return Response.json(
      { error: "Parse this CV before generating answers." },
      { status: 409 },
    );

  try {
    return Response.json(await generateJobAnswers(body.data.job, parsed.data), {
      headers,
    });
  } catch (error) {
    let message = "Answer generation failed. Please try again.";
    if (error instanceof OpenAI.APIError) {
      if (
        [
          "credit_balance_exhausted",
          "insufficient_quota",
          "billing_hard_limit_reached",
        ].includes(error.code ?? "")
      )
        message =
          "OpenAI has no available credits. Check API billing before retrying.";
      else if (error.status === 429)
        message = "The AI service is busy. Please try again shortly.";
      else if (error.status === 401 || error.status === 403)
        message =
          "The AI service configuration needs attention. Check the API key and model access.";
      console.error("Answer generation failed", {
        status: error.status,
        code: error.code,
        requestId: error.requestID,
      });
    }

    return Response.json({ error: message }, { status: 502, headers });
  }
}
