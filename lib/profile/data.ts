import { eq } from "drizzle-orm";
import { db } from "../db";
import { profile } from "../db/schema";
import { parseStoredProfile, type Profile } from "./schema";

// null when the user has never saved a profile, or the stored one is unreadable.
export async function loadProfile(userId: string) {
  const [row] = await db
    .select({ data: profile.data, updatedAt: profile.updatedAt })
    .from(profile)
    .where(eq(profile.userId, userId));

  const parsed = row && parseStoredProfile(row.data);

  return parsed ? { profile: parsed, updatedAt: row.updatedAt } : null;
}

export async function saveProfile(userId: string, data: Profile) {
  const [row] = await db
    .insert(profile)
    .values({ userId, data })
    .onConflictDoUpdate({
      target: profile.userId,
      set: { data, updatedAt: new Date() },
    })
    .returning({ data: profile.data, updatedAt: profile.updatedAt });

  return { profile: row.data, updatedAt: row.updatedAt };
}
