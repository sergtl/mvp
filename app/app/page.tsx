import { CVUploader } from "@/app/components/cv-upload";
import { JobImporter } from "@/app/components/job-application";
import { SetupChecklist } from "@/app/components/setup-checklist";
import { requireSession } from "@/lib/require-session";

export default async function AppPage() {
  const { user } = await requireSession();

  return (
    <main className="flex flex-1 px-8 py-8">
      <div className="w-full max-w-2xl space-y-6">
        <SetupChecklist key={`setup-${user.id}`} userId={user.id} />
        <CVUploader key={user.id} userId={user.id} />
        <JobImporter key={`jobs-${user.id}`} userId={user.id} />
      </div>
    </main>
  );
}
