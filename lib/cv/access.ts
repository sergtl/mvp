import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cv } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function ownedCV(request: Request, id: string, mutation = false) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return {
      error: Response.json(
        { error: "Sign in to access your CV." },
        { status: 401 },
      ),
    };

  if (
    mutation &&
    request.headers.get("origin") !==
      new URL(process.env.BETTER_AUTH_URL ?? request.url).origin
  ) {
    return {
      error: Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      ),
    };
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return {
      error: Response.json({ error: "CV not found." }, { status: 404 }),
    };

  const [record] = await db
    .select()
    .from(cv)
    .where(and(eq(cv.id, id), eq(cv.userId, session.user.id)));

  if (!record)
    return {
      error: Response.json({ error: "CV not found." }, { status: 404 }),
    };

  return { record };
}
