import { createHash } from "node:crypto";
import { z } from "zod";
import { aiFailure } from "@/lib/ai/errors";
import { authorizedJson, noStore as headers } from "@/lib/api/request";
import { classifyRequirements, type JobRequirements } from "@/lib/jobs/requirements";
import { loadProfile } from "@/lib/profile/data";
import { checkEligibility } from "@/lib/profile/eligibility";
import { emptyProfile } from "@/lib/profile/schema";

export const runtime = "nodejs";
export const maxDuration = 90;

const bodySchema = z.object({
  job: z.object({
    title: z.string().max(1000),
    company: z.string().max(1000),
    location: z.string().max(1000),
    description: z.string().max(200_000),
  }),
});

// What a posting requires does not depend on the user, so a re-import (or
// another user importing the same job) reuses the earlier reading for an hour.
const cache = new Map<string, { at: number; requirements: JobRequirements }>();
const TTL = 60 * 60 * 1000;

export async function POST(request: Request) {
  const parsed = await authorizedJson(request, bodySchema, {
    maxBytes: 512 * 1024,
    signIn: "Sign in to check a job.",
  });

  if ("error" in parsed) return parsed.error;

  const { userId, data } = parsed;
  const key = createHash("sha256").update(JSON.stringify(data.job)).digest("hex");

  try {
    let hit = cache.get(key);

    if (!hit || Date.now() - hit.at > TTL) {
      hit = { at: Date.now(), requirements: await classifyRequirements(data.job) };
      cache.set(key, hit);
      // Bounded: drop the oldest entry.
      if (cache.size > 200) cache.delete(cache.keys().next().value!);
    }

    const stored = await loadProfile(userId);

    return Response.json(
      {
        requirements: hit.requirements,
        eligibility: checkEligibility(stored?.profile ?? emptyProfile, hit.requirements),
        hasProfile: !!stored,
      },
      { headers },
    );
  } catch (error) {
    return Response.json(
      { error: aiFailure(error, "Eligibility check") },
      { status: 502, headers },
    );
  }
}
