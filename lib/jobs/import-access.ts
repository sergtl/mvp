import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jobImport } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function ownedImport(request: Request, id: string) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return {
      error: Response.json({ error: "Sign in to load a job." }, { status: 401 }),
    };

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return {
      error: Response.json({ error: "Job import not found." }, { status: 404 }),
    };

  const [record] = await db
    .select()
    .from(jobImport)
    .where(and(eq(jobImport.id, id), eq(jobImport.userId, session.user.id)));

  if (!record)
    return {
      error: Response.json({ error: "Job import not found." }, { status: 404 }),
    };

  return { record };
}
