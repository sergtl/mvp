import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listApplications } from "@/lib/applications/data";
import { ApplicationsTable } from "./table";

export default async function ApplicationsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect("/");

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
