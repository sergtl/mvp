"use client";

import { useMutation } from "@tanstack/react-query";
import { hasAnswer, resumeFields } from "@/lib/jobs/answer-draft";
import type { AnswerResult } from "@/lib/jobs/answers";
import type { Contractors } from "@/lib/jobs/contractors";
import type { ImportedJob } from "@/lib/jobs/types";
import type { AnswerDraft } from "./use-answer-draft";
import { downloadSelectedCV, type ParsedCV } from "./download-selected-cv";

type GeneratedResult = AnswerResult & {
  attachedCV?: { cvId: string; file: File };
};

// "Generate answers": drafts empty required questions, cover letters,
// motivation questions, and LinkedIn/GitHub links from the selected CV.
export function useGenerateAnswers({
  job,
  draft,
  cvs,
  selectedCV,
  contractors,
}: {
  job: ImportedJob;
  draft: AnswerDraft;
  cvs: ParsedCV[] | undefined;
  selectedCV: string;
  contractors: Contractors | undefined;
}) {
  return useMutation<GeneratedResult, Error>({
    mutationFn: async () => {
      let attachedCV: { cvId: string; file: File } | undefined;

      // Attach independently of the AI request so an AI failure does not lose the PDF.
      if (resumeFields(job).some((field) => !hasAnswer(draft.answers[field.id]))) {
        const { cvId, file } = await downloadSelectedCV(cvs, selectedCV);

        attachedCV = { cvId, file };
        draft.attachResumeIfEmpty(cvId, file);
      }

      const response = await fetch("/api/jobs/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvId: selectedCV, job, contractors }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Unable to generate answers.");

      return { ...data, attachedCV };
    },
    retry: false,
    gcTime: 0,
    onSuccess: draft.applyGenerated,
  });
}
