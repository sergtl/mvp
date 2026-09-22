import { resumeFields } from "../jobs/answer-draft";
import { answerTargets, questionKind, type AnswerTarget } from "../jobs/answers";
import type { ImportedJob } from "../jobs/greenhouse";
import type { SubmissionFile, SubmissionInput } from "../submissions/types";

export type MemoryKind = "cover_letter" | "motivation" | "text";

export type MemoryEntry = {
  id: string;
  questionKey: string;
  question: string;
  kind: MemoryKind;
  answer: string;
  company: string;
  jobTitle: string;
  sourceURL: string;
  createdAt: Date;
};

export type NewMemory = Omit<MemoryEntry, "id" | "createdAt">;

// Same question, however it is capitalised or punctuated.
export const questionKey = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

const MIN_LENGTH = 20;

// What the user approved by applying. Only long-form answers are remembered:
// short fields (names, links) are cheap to fill and noisy to store.
export function memoryFromSubmission(
  input: SubmissionInput,
  files: SubmissionFile[],
): NewMemory[] {
  const skip = new Set(resumeFields(input.job).map((f) => f.questionKey));

  return answerTargets(input.job, { includeOptional: true }).flatMap((target) => {
    if (target.manualReason || skip.has(target.questionKey)) return [];

    const [s, q] = target.questionKey.split("-").map(Number);
    const question = input.job.sections[s]?.questions[q];

    if (!question) return [];

    const kind = questionKind(question);
    const memoryKind: MemoryKind | null =
      kind === "cover_letter"
        ? "cover_letter"
        : kind === "motivation"
          ? "motivation"
          : target.type === "textarea"
            ? "text"
            : null;

    if (!memoryKind) return [];

    const value = input.answers[target.id];
    const file = files.find(
      (f) => f.fieldId === target.id && f.contentType.startsWith("text/"),
    );
    const answer = (
      typeof value === "string" ? value : (file?.content.toString("utf8") ?? "")
    ).trim();

    return answer.length < MIN_LENGTH
      ? []
      : [
          {
            questionKey: questionKey(target.label),
            question: target.label,
            kind: memoryKind,
            answer,
            company: input.job.company,
            jobTitle: input.job.title,
            sourceURL: input.job.sourceURL,
          },
        ];
  });
}

export type MemoryPlan = {
  reuse: { id: string; answer: string; company: string }[];
  examples: { kind: MemoryKind; question: string; answer: string }[];
};

const EXAMPLES_PER_KIND = 3;

// Reuse is only for company-neutral questions, and only when nothing in the
// old answer or the new question is tied to a company. Cover letters and
// motivation answers are never copied, only shown to the model as voice.
export function planMemory(
  job: ImportedJob,
  targets: AnswerTarget[],
  memory: MemoryEntry[],
): MemoryPlan {
  const plan: MemoryPlan = { reuse: [], examples: [] };
  const company = job.company.trim().toLowerCase();
  const kinds = new Set<MemoryKind>();

  for (const target of targets) {
    if (target.manualReason) continue;

    const [s, q] = target.questionKey.split("-").map(Number);
    const question = job.sections[s]?.questions[q];

    if (!question) continue;

    const kind = questionKind(question);

    if (kind === "cover_letter" || kind === "motivation") {
      kinds.add(kind);
      continue;
    }

    if (target.type !== "textarea" || kind !== "other") continue;

    const key = questionKey(target.label);
    const found = memory.find((entry) => {
      const old = entry.company.trim().toLowerCase();

      return (
        entry.kind === "text" &&
        entry.questionKey === key &&
        entry.sourceURL !== job.sourceURL &&
        !(company && key.includes(company)) &&
        !(old && old !== company && entry.answer.toLowerCase().includes(old))
      );
    });

    if (found)
      plan.reuse.push({ id: target.id, answer: found.answer, company: found.company });
  }

  for (const kind of kinds)
    plan.examples.push(
      ...memory
        .filter((entry) => entry.kind === kind && entry.sourceURL !== job.sourceURL)
        .slice(0, EXAMPLES_PER_KIND)
        .map(({ kind, question, answer }) => ({ kind, question, answer })),
    );

  return plan;
}
