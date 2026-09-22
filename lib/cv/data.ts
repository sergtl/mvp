import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { cvParse, cvReview } from "../db/schema";
import { extractedCVSchema } from "./extraction-schema";

// The CV facts to draft from: the user's reviewed version if they saved one,
// otherwise the latest completed parse. null when the CV has not been parsed.
export async function loadCVData(cvId: string) {
  const [parse] = await db
    .select({ data: cvParse.extractedData })
    .from(cvParse)
    .where(and(eq(cvParse.cvId, cvId), eq(cvParse.status, "completed")))
    .orderBy(desc(cvParse.createdAt))
    .limit(1);

  const [review] = await db
    .select({ data: cvReview.data })
    .from(cvReview)
    .where(eq(cvReview.cvId, cvId));

  const parsed = extractedCVSchema.safeParse(review?.data ?? parse?.data);

  return parse && parsed.success ? parsed.data : null;
}
