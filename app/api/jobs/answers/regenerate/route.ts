import { z } from "zod";
import { aiFailure } from "@/lib/ai/errors";
import { authorizedJson, noStore as headers } from "@/lib/api/request";
import { loadMemory } from "@/lib/answers/memory";
import { ownedCV } from "@/lib/cv/access";
import { loadCVData } from "@/lib/cv/data";
import { answerRequestSchema } from "@/lib/jobs/answers";
import { RegenerateError, regenerateAnswer } from "@/lib/jobs/generate-answers";
import { loadProfile } from "@/lib/profile/data";

export const runtime = "nodejs";
export const maxDuration = 90;

const bodySchema = answerRequestSchema.extend({
  questionKey: z.string().regex(/^\d+-\d+$/),
  instruction: z.string().trim().min(1).max(500),
  current: z.string().max(20_000),
});

export async function POST(request: Request) {
  const parsed = await authorizedJson(request, bodySchema, {
    maxBytes: 512 * 1024,
    signIn: "Sign in to regenerate an answer.",
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
    const [stored, memory] = await Promise.all([loadProfile(userId), loadMemory(userId)]);
    const result = await regenerateAnswer(
      data.job,
      cvData,
      { questionKey: data.questionKey, instruction: data.instruction, current: data.current },
      undefined,
      stored?.profile,
      { contractors: data.contractors, memory },
    );

    return Response.json(
      { answer: result.answers[0] ?? null, note: result.skipped[0]?.reason ?? null },
      { headers },
    );
  } catch (error) {
    if (error instanceof RegenerateError)
      return Response.json(
        { error: error.message },
        { status: error.code === "not_found" ? 404 : 409, headers },
      );

    return Response.json(
      { error: aiFailure(error, "Regenerating the answer") },
      { status: 502, headers },
    );
  }
}
