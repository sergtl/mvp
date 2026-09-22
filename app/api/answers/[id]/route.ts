import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { answerMemory } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json({ error: "Sign in to manage your answers." }, { status: 401 });

  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL ?? request.url).origin
  )
    return Response.json({ error: "Invalid request origin." }, { status: 403 });

  const { id } = await context.params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return Response.json({ error: "Answer not found." }, { status: 404 });

  const deleted = await db
    .delete(answerMemory)
    .where(and(eq(answerMemory.id, id), eq(answerMemory.userId, session.user.id)))
    .returning({ id: answerMemory.id });

  return deleted.length
    ? Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ error: "Answer not found." }, { status: 404 });
}
