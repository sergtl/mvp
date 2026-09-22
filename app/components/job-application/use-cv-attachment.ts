"use client";

import { useMutation } from "@tanstack/react-query";
import type { AnswerDraft } from "./use-answer-draft";
import { downloadSelectedCV, type ParsedCV } from "./download-selected-cv";

// "Attach selected CV PDF": attaches or replaces the resume upload, no AI call.
export function useCvAttachment({
  draft,
  cvs,
  selectedCV,
}: {
  draft: AnswerDraft;
  cvs: ParsedCV[] | undefined;
  selectedCV: string;
}) {
  return useMutation({
    mutationFn: () => downloadSelectedCV(cvs, selectedCV),
    retry: false,
    gcTime: 0,
    onSuccess: draft.applyAttachment,
  });
}
