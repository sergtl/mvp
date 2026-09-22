"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { ImportedJob } from "@/lib/jobs/types";
import type { Answer, SavedCVAttachment } from "@/lib/jobs/answer-draft";
import { activeStatuses, type SubmissionRecord } from "@/lib/submissions/types";

export function SubmissionPanel({
  job,
  userId,
  answers,
  freeText,
  attachments,
  busy,
}: {
  job: ImportedJob;
  userId: string;
  answers: Record<string, Answer>;
  freeText: Record<string, string>;
  attachments: Record<string, SavedCVAttachment>;
  busy: boolean;
}) {
  const [reviewed, setReviewed] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ["submission", userId, job.sourceURL];

  const status = useQuery<{ submission: SubmissionRecord | null }>({
    queryKey,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/submissions?${new URLSearchParams({ url: job.sourceURL })}`,
        { signal },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Unable to load submission status.");
      return data;
    },
    refetchInterval: (query) =>
      query.state.data?.submission &&
      activeStatuses.includes(query.state.data.submission.status)
        ? 2000
        : false,
  });

  const apply = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      const values: Record<string, string | string[] | boolean> = {};
      const savedFiles: Record<string, { cvId: string }> = {};
      for (const [id, value] of Object.entries(answers)) {
        if (value instanceof File) {
          if (attachments[id]) savedFiles[id] = { cvId: attachments[id].cvId };
          else form.append(`file:${id}`, value);
        } else if (value !== null) values[id] = value;
      }

      form.append(
        "application",
        JSON.stringify({
          job,
          answers: values,
          freeText,
          attachments: savedFiles,
        }),
      );

      const response = await fetch("/api/submissions", {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok)
        throw new Error(data.error ?? "Unable to queue this application.");

      return data as { submission: SubmissionRecord };
    },
    retry: false,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      setReviewed(false);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const record = status.data?.submission;
  const locked = !!record && record.status !== "failed";

  return (
    <section
      className="space-y-3 rounded-md border p-4"
      aria-label="Submit application"
    >
      <h2 className="font-semibold">Submit application</h2>
      <p className="text-sm text-muted-foreground">
        Apply sends a saved copy of these answers and attachments to the job board.
        Run the submission worker on this computer; its browser may need your
        help with CAPTCHA or extra fields.
      </p>
      {record && (
        <div role="status" className="space-y-1 text-sm">
          <p className="font-medium">{record.status.replaceAll("_", " ")}</p>
          <p>{record.message ?? "Waiting for the submission worker…"}</p>
          <Link className="inline-block text-sm underline underline-offset-4" href={`/app/applications/${record.id}`}>
            View saved application
          </Link>
        </div>
      )}
      {!locked && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={reviewed}
            disabled={busy || apply.isPending}
            onChange={(event) => setReviewed(event.target.checked)}
          />
          I’ve reviewed these answers and attachments and want to submit this
          application.
        </label>
      )}
      <Button
        type="button"
        disabled={
          busy ||
          apply.isPending ||
          status.isPending ||
          status.isError ||
          locked ||
          !reviewed
        }
        onClick={() => apply.mutate()}
      >
        {apply.isPending ? "Queuing application…" : "Apply"}
      </Button>

      {status.error && (
        <div className="text-sm">
          <p role="alert">{status.error.message}</p>
          <Button variant="outline" onClick={() => void status.refetch()}>
            Retry status
          </Button>
        </div>
      )}

      {apply.error && (
        <p role="alert" className="text-sm text-destructive">
          {apply.error.message}
        </p>
      )}

      {locked && (
        <p className="text-xs text-muted-foreground">
          Changes above do not affect the saved application.
        </p>
      )}
    </section>
  );
}
