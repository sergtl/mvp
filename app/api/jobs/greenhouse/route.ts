import { auth } from "@/auth";
import { fetchGreenhouseJob, JobImportError } from "@/lib/jobs/greenhouse";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session)
    return Response.json({ error: "Sign in to load a job." }, { status: 401 });

  const url = new URL(request.url).searchParams.get("url");

  if (!url || url.length > 2048)
    return Response.json(
      { error: "Enter a Greenhouse job URL (up to 2,048 characters)." },
      { status: 400 },
    );

  try {
    return Response.json(await fetchGreenhouseJob(url), {
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
