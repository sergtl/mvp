import { db } from "@/lib/db";
import { cvParse, cvReview } from "@/lib/db/schema";
import { ownedCV } from "@/lib/cv/access";
import { extractedCVSchema } from "@/lib/cv/extraction-schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await ownedCV(request, id, true);
  if (access.error) return access.error;
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing review." }, { status: 400 });
  let body = "";
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 256 * 1024) {
        await reader.cancel();
        return Response.json({ error: "Review is too large." }, { status: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally { reader.releaseLock(); }
  let parsed;
  try { parsed = extractedCVSchema.safeParse(JSON.parse(body)); }
  catch { return Response.json({ error: "Invalid review." }, { status: 400 }); }
  if (!parsed.success) return Response.json({ error: "Check the review fields." }, { status: 400 });
  const [completed] = await db.select({ id: cvParse.id }).from(cvParse).where(and(eq(cvParse.cvId, id), eq(cvParse.status, "completed"))).limit(1);
  if (!completed) return Response.json({ error: "Wait for parsing to complete." }, { status: 409 });
  const [review] = await db.insert(cvReview).values({ cvId: id, data: parsed.data })
    .onConflictDoUpdate({ target: cvReview.cvId, set: { data: parsed.data, updatedAt: new Date() } }).returning();
  return Response.json({ review }, { headers: { "Cache-Control": "no-store" } });
}
