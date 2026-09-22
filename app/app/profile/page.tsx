import { ProfileForm } from "@/app/components/profile";
import { loadProfile } from "@/lib/profile/data";
import { emptyProfile } from "@/lib/profile/schema";
import { requireSession } from "@/lib/require-session";

export default async function ProfilePage() {
  const session = await requireSession();

  const saved = await loadProfile(session.user.id);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Facts about you that a CV doesn&apos;t show. They fill in matching
          questions on applications, and are never guessed. Changes are saved
          automatically.
        </p>
      </div>
      <ProfileForm
        initial={saved?.profile ?? emptyProfile}
        savedAt={saved?.updatedAt.toISOString() ?? null}
      />
    </main>
  );
}
