import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jobImport } from "@/lib/db/schema";
import { resolveAts } from "@/lib/jobs/ats-adapter";
import { JobImportError } from "@/lib/jobs/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json({ error: "Sign in to load a job." }, { status: 401 });

  const url = new URL(request.url).searchParams.get("url");

  if (!url || url.length > 2048)
    return Response.json(
      { error: "Enter a job posting URL (up to 2,048 characters)." },
      { status: 400 },
    );

  const resolved = resolveAts(url);

  if (!resolved)
    return Response.json(
      { error: "Paste a Greenhouse, Ashby, or Lever job posting URL." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );

  const { adapter, sourceURL } = resolved;

  // Greenhouse's form is an instant HTTP call - resolve inline, same
  // behavior as before this route supported more than one ATS.
  if (adapter.ats === "greenhouse") {
    try {
      return Response.json(await adapter.fetchForm(sourceURL), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof JobImportError
              ? error.message
              : "Unable to load this job.",
        },
        {
          status: error instanceof JobImportError ? error.status : 500,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  }

  // Ashby/Lever have no instant API for a posting's questions - queue a
  // browser-based read and let the client poll, same shape as CV parsing.
  const [record] = await db
    .insert(jobImport)
    .values({ userId: session.user.id, ats: adapter.ats, sourceURL })
    .returning({ id: jobImport.id });

  return Response.json(
    { importId: record.id },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
