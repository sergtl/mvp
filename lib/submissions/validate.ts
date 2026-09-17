import type { ImportedJob } from "../jobs/greenhouse";
import type { SubmissionInput } from "./types";
import { isDeepStrictEqual } from "node:util";

export class SubmissionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function validateSubmission(
  input: SubmissionInput,
  live: ImportedJob,
  fileIds: Set<string>,
) {
  // IDs in the draft are positional. Never apply them to a changed form.
  if (!isDeepStrictEqual(input.job.sections, live.sections)) {
    throw new SubmissionError(
      "The application questions changed. Reload the job and review your answers.",
      409,
    );
  }

  const known = new Set<string>();

  live.sections.forEach((section, s) =>
    section.questions.forEach((question, q) => {
      let answered = false;
      question.fields.forEach((field, f) => {
        const id = `${s}-${q}-${f}`;
        known.add(id);
        const value = input.answers[id];
        if (field.type === "input_hidden") return;
        if (field.type === "input_file") {
          answered ||= fileIds.has(id);
          return;
        }
        if (
          value === undefined ||
          value === "" ||
          (Array.isArray(value) && !value.length)
        )
          return;
        if (field.type === "consent") {
          if (typeof value !== "boolean")
            throw new SubmissionError(`Check ${question.label}.`);
          answered ||= value;
        } else if (field.type.startsWith("multi_value_")) {
          if (
            field.type === "multi_value_single_select" &&
            typeof value !== "string"
          )
            throw new SubmissionError(
              `Choose one answer for ${question.label}.`,
            );
          if (
            field.type === "multi_value_multi_select" &&
            !Array.isArray(value)
          )
            throw new SubmissionError(`Check ${question.label}.`);
          const selected = Array.isArray(value) ? value : [String(value)];
          if (selected.some((v) => !field.options.some((o) => o.value === v)))
            throw new SubmissionError(
              `An option changed for ${question.label}.`,
              409,
            );
          if (
            selected.length === 1 &&
            field.options.find((o) => o.value === selected[0])?.freeForm &&
            !input.freeText[`${id}:${selected[0]}`]?.trim()
          )
            throw new SubmissionError(
              `Please specify your answer for ${question.label}.`,
            );
          answered = true;
        } else if (["input_text", "textarea"].includes(field.type)) {
          if (typeof value !== "string")
            throw new SubmissionError(`Check ${question.label}.`);
          answered ||= !!value.trim();
        } else
          throw new SubmissionError(
            `Complete ${question.label} on the original posting; this field is not supported.`,
          );
      });
      if (
        question.required &&
        question.fields.some((f) => f.type !== "input_hidden") &&
        !answered
      )
        throw new SubmissionError(`Please complete: ${question.label}.`);
    }),
  );

  for (const id of [...Object.keys(input.answers), ...fileIds]) {
    if (!known.has(id))
      throw new SubmissionError("The application contains an unknown field.");
  }

  for (const id of fileIds) {
    const [s, q, f] = id.split("-").map(Number);

    if (live.sections[s]?.questions[q]?.fields[f]?.type !== "input_file")
      throw new SubmissionError("An attachment does not match a file field.");
  }
}
