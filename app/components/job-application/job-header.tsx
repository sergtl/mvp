import type { ImportedJob } from "@/lib/jobs/types";

export function JobHeader({ job }: { job: ImportedJob }) {
  return (
    <header className="space-y-2">
      <h2 className="text-xl font-semibold">{job.title}</h2>
      <p className="text-sm text-muted-foreground">
        {[job.company, job.location].filter(Boolean).join(" · ")}
      </p>
      <a
        href={job.sourceURL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm underline"
      >
        View original posting
      </a>
    </header>
  );
}
