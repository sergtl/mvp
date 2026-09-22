"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cvParseKey } from "./use-cv-parse";

// "Parse CV" / "Retry parsing".
export function useRetryParse(cvId: string, userId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/cvs/${cvId}/parse`, { method: "POST" });
      const value = await response.json();

      if (!response.ok)
        throw new Error(value.error ?? "The request failed. Please try again.");

      return value;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: cvParseKey(userId, cvId) });
      await client.invalidateQueries({ queryKey: ["setup", userId] });
    },
  });
}
