"use client";

import { Button } from "@/components/ui/button";
import type { ImportedJob } from "@/lib/jobs/greenhouse";
import { QuestionFields } from "./question-fields";
import type { AnswerDraft } from "./use-answer-draft";
import type { useRegenerateAnswer } from "./use-regenerate-answer";

// The job's sections and questions, and "Check required fields".
export function AnswersForm({
  job,
  draft,
  draftable,
  selectedCV,
  busy,
  regenerate,
}: {
  job: ImportedJob;
  draft: AnswerDraft;
  draftable: Set<string>;
  selectedCV: string;
  busy: boolean;
  regenerate: ReturnType<typeof useRegenerateAnswer>;
}) {
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        draft.validate();
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">Application fields</h2>
        <p className="text-sm text-muted-foreground">
          Required questions are marked *. Answers and selected files stay on
          this page and are cleared when you leave or load another job.
        </p>
      </div>

      {job.sections.map((section, s) => (
        <section key={s} className="space-y-4">
          <h3 className="font-semibold">{section.title}</h3>
          {section.description && (
            <p className="whitespace-pre-wrap text-sm">{section.description}</p>
          )}
          {section.questions.map((question, q) => {
            const key = `${s}-${q}`;

            return (
              <QuestionFields
                key={key}
                sectionIndex={s}
                questionIndex={q}
                question={question}
                draft={draft}
                draftable={draftable}
                selectedCV={selectedCV}
                busy={busy || regenerate.isPending}
                onRegenerate={(key, instruction) => regenerate.mutate({ key, instruction })}
                regenerating={regenerate.isPending && regenerate.variables?.key === key}
                regenerateError={
                  regenerate.variables?.key === key ? regenerate.error?.message : undefined
                }
              />
            );
          })}
        </section>
      ))}
      <Button type="submit" variant="outline">
        Check required fields
      </Button>
      {draft.notice && (
        <p role="status" className="text-sm">
          {draft.notice}
        </p>
      )}
    </form>
  );
}
