import { z } from "zod";
import type { ImportedJob } from "./greenhouse";

const text = z.string().max(100_000);
export const answerRequestSchema = z.object({
  cvId: z.uuid(),
  job: z.object({
    id: z.string(),
    title: text,
    company: text,
    location: text,
    description: text,
    sourceURL: z.string().url(),
    sections: z
      .array(
        z.object({
          title: text,
          description: text,
          questions: z
            .array(
              z.object({
                label: text,
                description: text,
                required: z.boolean(),
                fields: z
                  .array(
                    z.object({
                      name: z.string().max(300),
                      type: z.string().max(100),
                      options: z
                        .array(
                          z.object({
                            value: z.string().max(300),
                            label: text,
                            freeForm: z.boolean().optional(),
                          }),
                        )
                        .max(1000),
                    }),
                  )
                  .max(20),
              }),
            )
            .max(200),
        }),
      )
      .max(50),
  }),
});

export type AnswerTarget = {
  id: string;
  questionKey: string;
  label: string;
  description: string;
  type: string;
  options: { value: string; label: string; freeForm?: boolean }[];
  manualReason: string | null;
};

export function answerTargets(job: ImportedJob): AnswerTarget[] {
  return job.sections.flatMap((section, s) =>
    section.questions.flatMap((q, i) => {
      const cover = /cover[ _-]?letter/i.test(
        q.label +
          " " +
          q.description +
          " " +
          q.fields.map((f) => f.name).join(" "),
      );
      const motivation =
        /why\b|motivat|interest.*(?:role|company|position)|what.*(?:attract|excite)/i.test(
          q.label + " " + q.description,
        );
      const profileLink = /linked[ _-]?in|git[ _-]?hub/i.test(
        q.label +
          " " +
          q.description +
          " " +
          q.fields.map((field) => field.name).join(" "),
      );

      if (!q.required && !cover && !motivation && !profileLink) return [];

      // Resume/cover letter alternatives are a single answer. Prefer editable text.
      let f = q.fields.findIndex((field) => field.type === "textarea");
      if (f < 0)
        f = q.fields.findIndex((field) => field.type !== "input_hidden");
      if (f < 0) return [];
      const field = q.fields[f];
      const personal =
        /consent|agree(?:ment)?|certif|attest|acknowledg|arbitrat|privacy|gender|race|ethnic|disabil|veteran|sexual|religio|citizenship|visa|sponsor|authori[sz].*work|eligible.*work|salary|compensation|relocat|start date|notice period|criminal|background check/i;
      const manualReason =
        field.type === "consent" ||
        field.name.startsWith("demographic_") ||
        /Equal opportunity|Data consent/i.test(section.title) ||
        personal.test(q.label)
          ? "Please answer this personally; your CV cannot confirm this choice."
          : field.type === "input_file" && !cover
            ? "Please attach the requested file."
            : ![
                  "input_text",
                  "textarea",
                  "multi_value_single_select",
                  "multi_value_multi_select",
                  "input_file",
                ].includes(field.type)
              ? "Please complete this field yourself."
              : null;
      return [
        {
          id: `${s}-${i}-${f}`,
          questionKey: `${s}-${i}`,
          label: q.label,
          description: q.description,
          type: field.type,
          options: field.options,
          manualReason,
        },
      ];
    }),
  );
}

export const generatedAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        id: z.string(),
        value: z.string().max(12000),
        selectedValues: z.array(z.string()).max(100),
        needsInput: z.boolean(),
        reason: z.string().max(500),
      }),
    )
    .max(200),
});

export type GeneratedAnswers = z.infer<typeof generatedAnswersSchema>;
export type AnswerResult = {
  answers: { id: string; value: string | string[]; fileText?: string }[];
  skipped: { questionKey: string; reason: string }[];
};

export function validateGeneratedAnswers(
  targets: AnswerTarget[],
  generated: GeneratedAnswers,
): AnswerResult {
  const result: AnswerResult = { answers: [], skipped: [] };

  for (const target of targets) {
    const matches = generated.answers.filter((a) => a.id === target.id);
    const answer = matches.length === 1 ? matches[0] : undefined;
    let reason = target.manualReason;

    if (!reason && (!answer || answer.needsInput))
      reason =
        answer?.reason ||
        "The CV does not provide enough information. Please fill this in.";

    if (!reason && answer) {
      if (target.type.startsWith("multi_value_")) {
        const selected = [...new Set(answer.selectedValues)];
        if (
          !selected.length ||
          (target.type === "multi_value_single_select" &&
            selected.length !== 1) ||
          selected.some(
            (v) => !target.options.some((o) => o.value === v && !o.freeForm),
          )
        ) {
          reason =
            "Please choose an answer; a supported option could not be determined from the CV.";
        } else
          result.answers.push({
            id: target.id,
            value:
              target.type === "multi_value_single_select"
                ? selected[0]
                : selected,
          });
      } else if (answer.value.trim()) {
        result.answers.push({
          id: target.id,
          value: answer.value.trim(),
          ...(target.type === "input_file"
            ? { fileText: answer.value.trim() }
            : {}),
        });
      } else
        reason =
          "The CV does not provide enough information. Please fill this in.";
    }

    if (reason)
      result.skipped.push({ questionKey: target.questionKey, reason });
  }

  return result;
}
