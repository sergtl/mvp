import { db } from "@/lib/db";
import { cv, cvParse, cvReview } from "@/lib/db/schema";
import { ownedCV } from "@/lib/cv/access";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const access = await ownedCV(request, id);
  if (access.error) return access.error;
  const [parse] = await db.select().from(cvParse).where(eq(cvParse.cvId, id)).orderBy(desc(cvParse.createdAt)).limit(1);
  const [review] = await db.select().from(cvReview).where(eq(cvReview.cvId, id));
  return Response.json({ parse: parse ?? null, review: review ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const access = await ownedCV(request, id, true);
  if (access.error) return access.error;
  if (access.record.contentType !== "application/pdf") return Response.json({ error: "Only PDFs can be parsed." }, { status: 415 });
  const parse = await db.transaction(async (tx) => {
    await tx.select().from(cv).where(eq(cv.id, id)).for("update");
    const [latest] = await tx.select().from(cvParse).where(eq(cvParse.cvId, id)).orderBy(desc(cvParse.createdAt)).limit(1);
    // Repeated clicks reuse pending work and successful results. Failed attempts
    // get a new row; automatic retries always reuse the original attempt.
    if (latest && ["queued", "processing", "completed"].includes(latest.status)) return latest;
    const [created] = await tx.insert(cvParse).values({ cvId: id }).returning();
    return created;
  });
  return Response.json({ parse }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
