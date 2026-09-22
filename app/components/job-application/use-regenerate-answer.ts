"use client";

import { useMutation } from "@tanstack/react-query";
import { answerTargets, type AnswerResult } from "@/lib/jobs/answers";
import type { Contractors } from "@/lib/jobs/contractors";
import type { ImportedJob } from "@/lib/jobs/types";
import type { AnswerDraft } from "./use-answer-draft";

type RegenerateResult = {
  answer: AnswerResult["answers"][number] | null;
  note: string | null;
};

// Redrafts one question following the user's instruction. Unlike Generate,
// this always replaces the current draft, because the user asked for it.
export function useRegenerateAnswer({
  job,
  draft,
  selectedCV,
  contractors,
}: {
  job: ImportedJob;
  draft: AnswerDraft;
  selectedCV: string;
  contractors: Contractors | undefined;
}) {
  return useMutation<RegenerateResult, Error, { key: string; instruction: string }>({
    mutationFn: async ({ key, instruction }) => {
      const target = answerTargets(job, { includeOptional: true }).find(
        (item) => item.questionKey === key,
      );
      const value = target ? draft.answers[target.id] : undefined;
      const current =
        typeof value === "string" ? value : (draft.fileDrafts[target?.id ?? ""] ?? "");

      const response = await fetch("/api/jobs/answers/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvId: selectedCV,
          job,
          contractors,
          questionKey: key,
          instruction,
          current,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Unable to regenerate this answer.");

      return data;
    },
    retry: false,
    gcTime: 0,
    onSuccess: ({ answer, note }, { key }) => draft.applyRegenerated(key, answer, note),
  });
}
