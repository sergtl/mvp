import { listApplications } from "@/lib/applications/data";
import { requireSession } from "@/lib/require-session";
import { ApplicationsTable } from "./table";

export default async function ApplicationsPage() {
  const session = await requireSession();

  const applications = await listApplications(session.user.id);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Applications</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Track your applications and review your saved answers.
        </p>
      </div>
      <ApplicationsTable applications={applications} />
    </main>
  );
}
