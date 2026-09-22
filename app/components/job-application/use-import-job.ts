"use client";

import { useMutation } from "@tanstack/react-query";
import type { ImportedJob } from "@/lib/jobs/greenhouse";

// Loads a Greenhouse job's description and application questions.
export function useImportJob() {
  return useMutation<ImportedJob, Error, string>({
    mutationFn: async (url) => {
      const response = await fetch(`/api/jobs/greenhouse?${new URLSearchParams({ url })}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Unable to load this job.");

      return data;
    },
    retry: false,
    gcTime: 0,
  });
}
