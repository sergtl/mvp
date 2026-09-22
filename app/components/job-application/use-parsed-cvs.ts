"use client";

import { useQuery } from "@tanstack/react-query";
import type { ParsedCV } from "./download-selected-cv";

// The user's parsed (readable) CVs, offered as the source for drafting answers.
export function useParsedCvs(userId: string) {
  return useQuery<{ cvs: ParsedCV[] }>({
    queryKey: ["answer-cvs", userId],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/jobs/answers", { signal });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Unable to load parsed CVs.");

      return data;
    },
  });
}
