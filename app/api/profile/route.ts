import { auth } from "@/auth";
import { loadProfile, saveProfile } from "@/lib/profile/data";
import { emptyProfile, profileSchema } from "@/lib/profile/schema";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json(
      { error: "Sign in to access your profile." },
      { status: 401 },
    );

  const saved = await loadProfile(session.user.id);

  return Response.json(
    {
      profile: saved?.profile ?? emptyProfile,
      updatedAt: saved?.updatedAt ?? null,
    },
    { headers },
  );
}

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json(
      { error: "Sign in to save your profile." },
      { status: 401 },
    );

  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL ?? request.url).origin
  )
    return Response.json({ error: "Invalid request origin." }, { status: 403 });

  const reader = request.body?.getReader();

  if (!reader)
    return Response.json({ error: "Missing profile." }, { status: 400 });

  let body = "";
  let size = 0;
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 64 * 1024) {
        await reader.cancel();
        return Response.json(
          { error: "Profile is too large." },
          { status: 413 },
        );
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  let parsed;

  try {
    parsed = profileSchema.safeParse(JSON.parse(body));
  } catch {
    return Response.json({ error: "Invalid profile." }, { status: 400 });
  }

  if (!parsed.success)
    return Response.json({ error: "Check the profile fields." }, { status: 400 });

  return Response.json(await saveProfile(session.user.id, parsed.data), {
    headers,
  });
}
