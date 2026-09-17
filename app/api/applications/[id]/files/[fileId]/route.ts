import { z } from "zod";
import { auth } from "@/auth";
import { getApplicationFile } from "@/lib/applications/data";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in to download attachments." }, { status: 401, headers: privateHeaders });
  const { id, fileId } = await context.params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(fileId).success)
    return Response.json({ error: "Attachment not found." }, { status: 404, headers: privateHeaders });
  const file = await getApplicationFile(session.user.id, id, fileId);
  if (!file) return Response.json({ error: "Attachment not found." }, { status: 404, headers: privateHeaders });
  const filename = encodeURIComponent(file.filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`);
  return new Response(new Uint8Array(file.content), { headers: {
    ...privateHeaders,
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${filename}`,
    "Content-Length": String(file.content.length),
    "X-Content-Type-Options": "nosniff",
  } });
}
