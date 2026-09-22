import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getApplication } from "@/lib/applications/data";
import { applicationStatusLabels } from "@/lib/applications/status";
import { requireSession } from "@/lib/require-session";
import { SavedApplicationForm } from "../saved-form";
import { RefreshApplications } from "../refresh";

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();

  const { id } = await params;

  if (!z.uuid().safeParse(id).success) notFound();

  const application = await getApplication(session.user.id, id);

  if (!application) notFound();

  const { job } = application.snapshot;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
      <Link
        href="/app/applications"
        className="text-sm underline underline-offset-4"
      >
        Back to applications
      </Link>

      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">{job.title}</h1>
        <p className="text-muted-foreground">
          {job.company || "Company not provided"}
          {job.location ? ` · ${job.location}` : ""}
        </p>
        <a
          href={application.sourceURL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm underline underline-offset-4"
        >
          View original job
        </a>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium">
            Status: {applicationStatusLabels[application.status]}
          </p>
          <RefreshApplications />
        </div>

        {application.message && (
          <p className="text-sm text-muted-foreground">{application.message}</p>
        )}

        <p className="text-xs text-muted-foreground">
          Saved {application.createdAt.toISOString().slice(0, 10)}
        </p>
      </header>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Saved application</h2>
          <p className="text-sm text-muted-foreground">
            These are the answers and attachments saved when you clicked Apply.
            They cannot be edited. Changes made directly in the worker’s
            browser are not captured here.
          </p>
        </div>
        <SavedApplicationForm
          id={id}
          snapshot={application.snapshot}
          files={application.files}
        />
      </section>
    </main>
  );
}
