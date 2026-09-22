import { ownedImport } from "@/lib/jobs/import-access";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const access = await ownedImport(request, id);

  if (access.error) return access.error;

  const { status, result, errorCode } = access.record;

  if (status === "failed")
    return Response.json(
      { status, error: errorCode === "unsupported_ats" ? "This job board is not supported." : "Unable to load this job. Try again shortly." },
      { headers: { "Cache-Control": "no-store" } },
    );

  return Response.json(
    { status, job: result ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
