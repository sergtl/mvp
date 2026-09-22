"use client";

import { useState } from "react";
import type { AnswerResult } from "@/lib/jobs/answers";
import type { ImportedJob } from "@/lib/jobs/types";
import {
  attachResume,
  applyGeneratedAnswers,
  resumeFields,
  validateRequiredAnswers,
  type Answer,
  type SavedCVAttachment,
} from "@/lib/jobs/answer-draft";

export type Provenance = { source: "profile" | "memory"; message: string };
type GeneratedResult = AnswerResult & {
  attachedCV?: { cvId: string; file: File };
};
type RegeneratedAnswer = AnswerResult["answers"][number];

const keyOf = (id: string) => id.split("-").slice(0, 2).join("-");

// Owns every piece of state for the answers a user is drafting on one job:
// the answers themselves, free-form sub-answers, validation errors, the
// current status notice, why a question was filled without the AI, editable
// cover-letter drafts, and which resume upload is a saved CV. Everything here
// stays on the page; nothing is sent until Apply.
export function useAnswerDraft(job: ImportedJob) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [freeText, setFreeTextState] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [generationNotes, setGenerationNotes] = useState<Record<string, string>>({});
  const [fileDrafts, setFileDrafts] = useState<Record<string, string>>({});
  const [provenance, setProvenance] = useState<Record<string, Provenance>>({});
  const [attachments, setAttachments] = useState<Record<string, SavedCVAttachment>>({});

  const clearNotice = () => {
    setNotice("");
    setErrors({});
  };

  // A question's own edit clears whatever explained or filled it before.
  const setAnswer = (id: string, value: Answer) => {
    const key = keyOf(id);

    clearNotice();
    setAttachments((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setGenerationNotes((notes) => {
      const next = { ...notes };
      delete next[key];
      return next;
    });
    setProvenance((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFileDrafts((drafts) => {
      const next = { ...drafts };
      delete next[id];
      return next;
    });
    setAnswers((a) => ({ ...a, [id]: value }));
  };

  const setFreeText = (freeTextKey: string, value: string) => {
    clearNotice();
    setFreeTextState((t) => ({ ...t, [freeTextKey]: value }));
  };

  // Editing a generated cover-letter draft directly, not through setAnswer:
  // it replaces the file answer but is not itself "a question being edited".
  const setFileDraftText = (id: string, text: string) => {
    setFileDrafts((drafts) => ({ ...drafts, [id]: text }));
    setAnswers((a) => ({
      ...a,
      [id]: text.trim()
        ? new File([text], "cover-letter.txt", { type: "text/plain" })
        : null,
    }));
  };

  // A pre-step before the AI call: fills an empty resume upload but never
  // replaces one the user or a previous attach already made. Applied directly
  // (not through applyAttachment) so it survives even if the AI call fails.
  const attachResumeIfEmpty = (cvId: string, file: File) => {
    const attached = attachResume(job, answers, attachments, cvId, file);

    setAnswers(attached.answers);
    setAttachments(attached.attachments);
  };

  // The explicit "Attach selected CV PDF" button: always replaces.
  const applyAttachment = ({ cvId, file }: { cvId: string; file: File }) => {
    const attached = attachResume(job, answers, attachments, cvId, file, true);

    setAnswers(attached.answers);
    setAttachments(attached.attachments);
    setGenerationNotes((notes) =>
      Object.fromEntries(
        Object.entries(notes).filter(
          ([key]) => !resumeFields(job).some((field) => field.questionKey === key),
        ),
      ),
    );
    setErrors({});
    setNotice(`Attached ${file.name}. This original PDF will be used for the application.`);
  };

  // "Generate answers": fills empty questions only, and never replaces an
  // upload the user already made or chose.
  const applyGenerated = (result: GeneratedResult) => {
    const base = result.attachedCV
      ? attachResume(job, answers, attachments, result.attachedCV.cvId, result.attachedCV.file)
          .answers
      : answers;

    const applied = applyGeneratedAnswers(base, fileDrafts, result);

    setAnswers(applied.answers);
    setFileDrafts(applied.fileDrafts);
    setGenerationNotes(applied.notes);
    setProvenance(applied.provenance);
    setErrors({});
    setNotice(
      `Filled ${applied.count} answers. Review the drafts and complete any questions marked for your input.`,
    );
  };

  // "Regenerate…" on one question: unlike Generate, this always replaces
  // what's there, because the user asked for it.
  const applyRegenerated = (
    key: string,
    answer: RegeneratedAnswer | null,
    note: string | null,
  ) => {
    setProvenance((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setGenerationNotes((notes) => {
      const next = { ...notes };
      if (answer) delete next[key];
      else if (note) next[key] = note;
      return next;
    });

    if (!answer) return;

    if (answer.fileText) {
      const text = answer.fileText;

      setFileDrafts((drafts) => ({ ...drafts, [answer.id]: text }));
      setAnswers((a) => ({
        ...a,
        [answer.id]: new File([text], "cover-letter.txt", { type: "text/plain" }),
      }));
    } else setAnswers((a) => ({ ...a, [answer.id]: answer.value }));
  };

  // "Check required fields".
  const validate = () => {
    const nextErrors = validateRequiredAnswers(job, answers, freeText);

    setErrors(nextErrors);
    setNotice(
      Object.keys(nextErrors).length
        ? "Please review the highlighted questions."
        : "All visible required questions are filled. Your answers are kept on this page only.",
    );
  };

  return {
    answers,
    freeText,
    errors,
    notice,
    generationNotes,
    fileDrafts,
    provenance,
    attachments,
    setAnswer,
    setFreeText,
    setFileDraftText,
    setNotice,
    clearNotice,
    attachResumeIfEmpty,
    applyAttachment,
    applyGenerated,
    applyRegenerated,
    validate,
  };
}

export type AnswerDraft = ReturnType<typeof useAnswerDraft>;
