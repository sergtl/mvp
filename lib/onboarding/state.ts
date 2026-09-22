import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { cv, cvParse, cvReview } from "../db/schema";
import { loadProfile } from "../profile/data";
import type { SetupState } from "./steps";

// A parse that was never handed to the worker after this long means the worker
// is not running.
const STUCK_AFTER_MS = 20_000;

export async function loadSetupState(userId: string): Promise<SetupState> {
  const cvs = await db
    .select({ id: cv.id, filename: cv.filename, contentType: cv.contentType })
    .from(cv)
    .where(eq(cv.userId, userId))
    .orderBy(desc(cv.createdAt));

  // Answers are drafted from a PDF; prefer the newest one.
  const chosen = cvs.find((c) => c.contentType === "application/pdf") ?? cvs[0];

  const [parse] = chosen
    ? await db
        .select()
        .from(cvParse)
        .where(eq(cvParse.cvId, chosen.id))
        .orderBy(desc(cvParse.createdAt))
        .limit(1)
    : [];

  const [review] = chosen
    ? await db.select({ id: cvReview.cvId }).from(cvReview).where(eq(cvReview.cvId, chosen.id))
    : [];

  const saved = await loadProfile(userId);
  const { residenceCountry, routes } = saved?.profile.eligibility ?? {
    residenceCountry: "",
    routes: [],
  };

  return {
    cv: chosen
      ? {
          id: chosen.id,
          filename: chosen.filename,
          isPdf: chosen.contentType === "application/pdf",
        }
      : null,
    parse: parse
      ? {
          status: parse.status,
          errorCode: parse.errorCode,
          stuck:
            parse.status === "queued" &&
            !parse.jobId &&
            Date.now() - parse.createdAt.getTime() > STUCK_AFTER_MS,
        }
      : null,
    reviewed: !!review,
    profile: { saved: !!saved, complete: !!residenceCountry && routes.length > 0 },
  };
}
