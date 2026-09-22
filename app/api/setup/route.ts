import { auth } from "@/auth";
import { loadSetupState } from "@/lib/onboarding/state";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json({ error: "Sign in to continue." }, { status: 401 });

  return Response.json(await loadSetupState(session.user.id), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
