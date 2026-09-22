import type { AnswerResult } from "./answers";
import type { ImportedJob } from "./greenhouse";

// Field types the application form can render and submit. Anything else is
// flagged for the user to complete on the original posting.
export const supportedFieldTypes = new Set([
  "input_text",
  "input_file",
  "input_hidden",
  "textarea",
  "multi_value_single_select",
  "multi_value_multi_select",
  "consent",
]);

export function resumeFields(job: ImportedJob) {
  return job.sections.flatMap((section, s) =>
    section.questions.flatMap((question, q) =>
      question.fields.flatMap((field, f) =>
        field.type === "input_file" &&
        (field.name === "resume" ||
          /\b(?:resume|résumé|cv|curriculum vitae)\b/i.test(question.label)) &&
        !/cover[ _-]?letter/i.test(question.label)
          ? [
              {
                id: `${s}-${q}-${f}`,
                name: field.name,
                questionKey: `${s}-${q}`,
              },
            ]
          : [],
      ),
    ),
  );
}

export type SavedCVAttachment = {
  cvId: string;
  filename: string;
  fieldName: string;
};

export function attachResume(
  job: ImportedJob,
  previous: Record<string, Answer>,
  references: Record<string, SavedCVAttachment>,
  cvId: string,
  file: File,
  replace = false,
) {
  const answers = { ...previous };
  const attachments = { ...references };
  let count = 0;

  for (const field of resumeFields(job)) {
    // Generation preserves manual uploads. The explicit attach button replaces them.
    if (!replace && hasAnswer(answers[field.id])) continue;
    answers[field.id] = file;
    attachments[field.id] = {
      cvId,
      filename: file.name,
      fieldName: field.name,
    };

    // Greenhouse accepts file OR text. Submit only the selected original PDF.
    for (const id of Object.keys(answers)) {
      if (id !== field.id && id.startsWith(`${field.questionKey}-`))
        delete answers[id];
    }
    count++;
  }

  return { answers, attachments, count };
}

export type Answer = string | string[] | boolean | File | null;
export const hasAnswer = (value: Answer | undefined) =>
  typeof value === "string"
    ? !!value.trim()
    : Array.isArray(value)
      ? value.length > 0
      : !!value;

// Check the entire question so an uploaded resume is never replaced by text.
export function applyGeneratedAnswers(
  previous: Record<string, Answer>,
  previousDrafts: Record<string, string>,
  result: AnswerResult,
) {
  const answers = { ...previous };
  const fileDrafts = { ...previousDrafts };

  let count = 0;
  // Why a question was filled without the AI, shown next to it.
  const provenance: Record<string, { source: "profile" | "memory"; message: string }> = {};

  const filled = (key: string) =>
    Object.entries(answers).some(
      ([id, value]) => id.startsWith(`${key}-`) && hasAnswer(value),
    );

  for (const answer of result.answers) {
    const key = answer.id.split("-").slice(0, 2).join("-");

    if (filled(key)) continue;

    if (answer.fileText) {
      answers[answer.id] = new File([answer.fileText], "cover-letter.txt", {
        type: "text/plain",
      });

      fileDrafts[answer.id] = answer.fileText;
    } else answers[answer.id] = answer.value;
    if (answer.source === "profile")
      provenance[key] = {
        source: "profile",
        message: "Filled from your profile. Change it there to update future applications.",
      };
    else if (answer.source === "memory")
      provenance[key] = {
        source: "memory",
        message: `Reused from your answer${answer.from ? ` to ${answer.from}` : ""}. Edit it if it needs changing.`,
      };
    count++;
  }

  const notes = Object.fromEntries(
    result.skipped
      .filter((item) => !filled(item.questionKey))
      .map((item) => [item.questionKey, item.reason]),
  );

  return { answers, fileDrafts, notes, count, provenance };
}

// "Check required fields": every required question has at least one visible
// answer, no unsupported field type is left unhandled, and every selected
// free-form option has its accompanying text filled in.
export function validateRequiredAnswers(
  job: ImportedJob,
  answers: Record<string, Answer>,
  freeText: Record<string, string>,
): Record<string, string> {
  const nextErrors: Record<string, string> = {};

  job.sections.forEach((section, s) =>
    section.questions.forEach((question, q) => {
      const key = `${s}-${q}`;
      const visible = question.fields
        .map((field, f) => ({ field, id: `${key}-${f}` }))
        .filter(({ field }) => field.type !== "input_hidden");

      if (
        question.required &&
        visible.length &&
        !visible.some(({ id }) => hasAnswer(answers[id]))
      )
        nextErrors[key] = "Answer this question using at least one of its inputs.";

      for (const { field, id } of visible) {
        if (!supportedFieldTypes.has(field.type))
          nextErrors[key] =
            "This question includes a field that must be completed on Greenhouse.";

        const value = answers[id];
        const selected = Array.isArray(value)
          ? value
          : typeof value === "string"
            ? [value]
            : [];

        if (
          selected.length === 1 &&
          field.options.some((o) => o.value === selected[0] && o.freeForm) &&
          !freeText[`${id}:${selected[0]}`]?.trim()
        )
          nextErrors[key] = "Please specify your selected answer.";
      }
    }),
  );

  return nextErrors;
}
