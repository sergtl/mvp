import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cv, cvFile } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json(
      { error: "Sign in to download your CV." },
      { status: 401 },
    );

  const { id } = await context.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return Response.json({ error: "CV not found." }, { status: 404 });
  }

  const [file] = await db
    .select({
      filename: cv.filename,
      contentType: cv.contentType,
      content: cvFile.content,
    })
    .from(cv)
    .innerJoin(cvFile, eq(cv.id, cvFile.cvId))
    .where(and(eq(cv.id, id), eq(cv.userId, session.user.id)));

  if (!file) return Response.json({ error: "CV not found." }, { status: 404 });

  const encodedName = encodeURIComponent(file.filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16)}`,
  );

  return new Response(new Uint8Array(file.content), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.content.length),
      "Content-Disposition": `attachment; filename="cv"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
