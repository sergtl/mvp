import type { z } from "zod";
import { auth } from "@/auth";

export const noStore = { "Cache-Control": "private, no-store" };

// Session, same-origin and size checks, then a validated JSON body.
export async function authorizedJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  { maxBytes, signIn }: { maxBytes: number; signIn: string },
): Promise<{ error: Response } | { userId: string; data: z.infer<S> }> {
  const fail = (error: string, status: number) => ({
    error: Response.json({ error }, { status }),
  });

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) return fail(signIn, 401);

  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL ?? request.url).origin
  )
    return fail("Invalid request origin.", 403);

  const reader = request.body?.getReader();

  if (!reader) return fail("Missing request.", 400);

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        return fail("This request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  let parsed;

  try {
    parsed = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    return fail("Invalid request.", 400);
  }

  return parsed.success
    ? { userId: session.user.id, data: parsed.data }
    : fail("Invalid request fields.", 400);
}
