"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { JobApplication } from "./job-application";
import { JobUrlForm } from "./job-url-form";
import { useImportJob } from "./use-import-job";

export function JobImporter({ userId }: { userId: string }) {
  const job = useImportJob();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job application</CardTitle>
      </CardHeader>
      <CardContent className="gap-6">
        <JobUrlForm onSubmitUrl={(url) => job.mutate(url)} pending={job.isPending} />

        {job.isPending && (
          <p role="status" className="text-sm">
            Loading the description and application questions…
          </p>
        )}

        {job.error && <FieldError>{job.error.message}</FieldError>}

        {job.isSuccess && (
          <JobApplication
            key={`${job.data.sourceURL}:${job.submittedAt}`}
            job={job.data}
            userId={userId}
          />
        )}
      </CardContent>
    </Card>
  );
}
