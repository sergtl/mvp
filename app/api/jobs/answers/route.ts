import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cv, cvParse } from "@/lib/db/schema";
import { aiFailure } from "@/lib/ai/errors";
import { authorizedJson, noStore as headers } from "@/lib/api/request";
import { loadMemory } from "@/lib/answers/memory";
import { ownedCV } from "@/lib/cv/access";
import { loadCVData } from "@/lib/cv/data";
import { answerRequestSchema } from "@/lib/jobs/answers";
import { generateJobAnswers } from "@/lib/jobs/generate-answers";
import { loadProfile } from "@/lib/profile/data";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 90;

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
  const parsed = await authorizedJson(request, answerRequestSchema, {
    maxBytes: 512 * 1024,
    signIn: "Sign in to generate answers.",
  });

  if ("error" in parsed) return parsed.error;

  const { userId, data } = parsed;
  const access = await ownedCV(request, data.cvId, true);

  if (access.error) return access.error;

  const cvData = await loadCVData(access.record.id);

  if (!cvData)
    return Response.json(
      { error: "Parse this CV before generating answers." },
      { status: 409 },
    );

  try {
    const [stored, memory] = await Promise.all([
      loadProfile(userId),
      loadMemory(userId),
    ]);

    return Response.json(
      await generateJobAnswers(
        data.job,
        cvData,
        undefined,
        // No (or an unreadable) profile only means nothing is pre-filled.
        stored?.profile,
        { contractors: data.contractors, memory },
      ),
      { headers },
    );
  } catch (error) {
    return Response.json(
      { error: aiFailure(error, "Answer generation") },
      { status: 502, headers },
    );
  }
}
