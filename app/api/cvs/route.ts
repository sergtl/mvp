import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cv, cvFile, cvParse } from "@/lib/db/schema";
import { readUpload, UploadError, validateUpload } from "@/lib/cv/upload";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json(
      { error: "Sign in to view your CVs." },
      { status: 401 },
    );

  const cvs = await db
    .select()
    .from(cv)
    .where(eq(cv.userId, session.user.id))
    .orderBy(desc(cv.createdAt));

  return Response.json(
    { cvs },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json({ error: "Sign in to upload a CV." }, { status: 401 });

  const expectedOrigin = new URL(process.env.BETTER_AUTH_URL ?? request.url)
    .origin;

  if (request.headers.get("origin") !== expectedOrigin) {
    return Response.json({ error: "Invalid upload origin." }, { status: 403 });
  }

  try {
    const content = await readUpload(request);
    const metadata = validateUpload(
      request.headers.get("x-file-name"),
      content,
    );

    const saved = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(cv)
        .values({
          ...metadata,
          userId: session.user.id,
          sizeBytes: content.length,
        })
        .returning();
      await tx.insert(cvFile).values({ cvId: record.id, content });

      if (metadata.contentType === "application/pdf") {
        await tx.insert(cvParse).values({ cvId: record.id });
      }
      return record;
    });

    return Response.json(
      { cv: saved },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof UploadError)
      return Response.json({ error: error.message }, { status: error.status });

    console.error(
      "CV upload failed",
      error instanceof Error ? error.name : "Unknown error",
    );

    return Response.json(
      { error: "Unable to save your CV. Please try again." },
      { status: 500 },
    );
  }
}
