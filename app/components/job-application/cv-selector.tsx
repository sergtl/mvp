"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { resumeFields } from "@/lib/jobs/answer-draft";
import type { ImportedJob } from "@/lib/jobs/greenhouse";
import type { ParsedCV } from "./download-selected-cv";

const control = "w-full min-w-0 rounded-md border bg-background p-2 text-sm";

// The pieces of a useMutation result this component actually reads.
type MutationLike = { isPending: boolean; error: Error | null; mutate: () => void };

// The CV-picker card: choose a parsed CV, optionally attach its original PDF,
// and generate answers from it.
export function CvSelector({
  job,
  cvs,
  selectedCV,
  onSelectCv,
  attach,
  generate,
  notice,
  clearNotice,
}: {
  job: ImportedJob;
  cvs: UseQueryResult<{ cvs: ParsedCV[] }>;
  selectedCV: string;
  onSelectCv: (id: string) => void;
  attach: MutationLike;
  generate: MutationLike;
  notice: string;
  clearNotice: () => void;
}) {
  const busy = generate.isPending || attach.isPending;

  return (
    <div className="space-y-3 rounded-md border p-4">
      <Field>
        <FieldLabel htmlFor="answer-cv">CV to use for answers</FieldLabel>
        <select
          id="answer-cv"
          className={control}
          value={selectedCV}
          disabled={busy || !cvs.data?.cvs.length}
          onChange={(event) => onSelectCv(event.target.value)}
        >
          {!cvs.data?.cvs.length && (
            <option value="">
              {cvs.isPending ? "Loading CVs…" : "No parsed CVs yet"}
            </option>
          )}
          {cvs.data?.cvs.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.filename}
            </option>
          ))}
        </select>
      </Field>
      <Button
        type="button"
        variant="outline"
        disabled={cvs.isFetching || busy}
        onClick={() => void cvs.refetch()}
      >
        Refresh CVs
      </Button>
      {resumeFields(job).length > 0 && (
        <Button
          type="button"
          variant="outline"
          disabled={busy || !selectedCV}
          onClick={() => {
            clearNotice();
            attach.mutate();
          }}
        >
          {attach.isPending ? "Attaching PDF…" : "Attach selected CV PDF"}
        </Button>
      )}
      {attach.error && <FieldError>{attach.error.message}</FieldError>}
      <FieldDescription>
        Generate answers also attaches your original PDF to an empty resume
        upload. Use Attach selected CV PDF to replace an existing attachment.
      </FieldDescription>
      <FieldDescription>
        Uses your saved CV corrections. Fills empty required answers, cover
        letters, motivation questions, and LinkedIn and GitHub links—even when
        optional. Review drafts before using them.
      </FieldDescription>
      {!cvs.isPending && !cvs.data?.cvs.length && (
        <p className="text-sm">Upload and parse a CV above to generate answers.</p>
      )}
      {cvs.error && <FieldError>{cvs.error.message}</FieldError>}
      <Button
        type="button"
        disabled={busy || !cvs.data?.cvs.some((cv) => cv.id === selectedCV)}
        onClick={() => {
          clearNotice();
          generate.mutate();
        }}
      >
        {generate.isPending ? "Generating answers…" : "Generate answers"}
      </Button>
      {generate.isPending && (
        <p role="status" className="text-sm">
          Reading your CV and drafting answers for this role…
        </p>
      )}
      {generate.error && <FieldError>{generate.error.message}</FieldError>}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </div>
  );
}
