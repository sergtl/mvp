import type { AnswerResult } from "./answers";
import type { ImportedJob } from "./greenhouse";

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
    count++;
  }

  const notes = Object.fromEntries(
    result.skipped
      .filter((item) => !filled(item.questionKey))
      .map((item) => [item.questionKey, item.reason]),
  );

  return { answers, fileDrafts, notes, count };
}
