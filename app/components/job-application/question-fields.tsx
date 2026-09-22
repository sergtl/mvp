"use client";

import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { JobQuestion } from "@/lib/jobs/types";
import { ApplicationField } from "./application-field";
import { RegenerateControl } from "./regenerate-control";
import type { AnswerDraft } from "./use-answer-draft";

// One question: its label(s), the field(s) that answer it, and everything
// that explains or offers to change that answer.
export function QuestionFields({
  sectionIndex: s,
  questionIndex: q,
  question,
  draft,
  draftable,
  selectedCV,
  busy,
  onRegenerate,
  regenerating,
  regenerateError,
}: {
  sectionIndex: number;
  questionIndex: number;
  question: JobQuestion;
  draft: AnswerDraft;
  draftable: Set<string>;
  selectedCV: string;
  busy: boolean;
  onRegenerate: (key: string, instruction: string) => void;
  regenerating: boolean;
  regenerateError?: string;
}) {
  const key = `${s}-${q}`;

  if (question.fields.every((f) => f.type === "input_hidden"))
    return (
      <div key={key} hidden>
        {question.fields.map((f, i) => (
          <input key={i} type="hidden" name={f.name} value="" />
        ))}
      </div>
    );

  const visibleFieldCount = question.fields.filter((f) => f.type !== "input_hidden").length;

  return (
    <FieldSet
      disabled={busy}
      className="gap-2 rounded-md border p-3"
      aria-describedby={draft.errors[key] ? `error-${key}` : undefined}
    >
      <FieldLegend variant="label" className="px-1">
        {question.label}
        {question.required ? " *" : " (optional)"}
      </FieldLegend>
      {question.description && (
        <FieldDescription className="whitespace-pre-wrap">{question.description}</FieldDescription>
      )}
      {visibleFieldCount > 1 && (
        <FieldDescription className="text-xs">
          Choose one way to answer this question.
        </FieldDescription>
      )}
      {question.fields.map((field, f) => {
        const id = `${key}-${f}`;
        const label =
          question.fields.length > 1
            ? field.type === "input_file"
              ? "Upload a file"
              : field.type === "textarea"
                ? "Enter text"
                : question.label
            : question.label;

        return (
          <Field key={id}>
            {field.type !== "input_hidden" && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
            <ApplicationField
              field={field}
              id={id}
              value={draft.answers[id]}
              change={(value) => draft.setAnswer(id, value)}
              freeText={draft.freeText}
              changeFreeText={draft.setFreeText}
            />
            {draft.attachments[id] && (
              <FieldDescription>
                Attached original CV:{" "}
                <a
                  className="underline"
                  href={`/api/cvs/${draft.attachments[id].cvId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {draft.attachments[id].filename}
                </a>
              </FieldDescription>
            )}
            {draft.fileDrafts[id] !== undefined && (
              <Field className="mt-2">
                <FieldLabel htmlFor={`draft-${id}`}>
                  Generated cover letter (cover-letter.txt)
                </FieldLabel>
                <Textarea
                  id={`draft-${id}`}
                  rows={10}
                  value={draft.fileDrafts[id]}
                  onChange={(event) => draft.setFileDraftText(id, event.target.value)}
                />
                <FieldDescription>
                  Draft prepared as a text file. Choose a different file above to replace it.
                </FieldDescription>
              </Field>
            )}
          </Field>
        );
      })}
      {draft.errors[key] && (
        <FieldError id={`error-${key}`}>{draft.errors[key]}</FieldError>
      )}
      {draft.provenance[key] && (
        <FieldDescription>{draft.provenance[key].message}</FieldDescription>
      )}
      {draftable.has(key) && draft.provenance[key]?.source !== "profile" && selectedCV && (
        <RegenerateControl
          disabled={busy}
          pending={regenerating}
          error={regenerateError}
          onRegenerate={(instruction) => onRegenerate(key, instruction)}
        />
      )}
      {draft.generationNotes[key] && (
        <p className="text-sm text-amber-700">{draft.generationNotes[key]}</p>
      )}
    </FieldSet>
  );
}
