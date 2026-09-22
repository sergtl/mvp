"use client";

import { useMutation } from "@tanstack/react-query";
import type { ExtractedCV } from "@/lib/cv/extraction-schema";

// PUT /api/cvs/:id/review. What happens after a successful save is the
// caller's business (it also owns the "saved" flag and the form instance),
// so this hook only wraps the request.
export function useSaveReview(cvId: string) {
  return useMutation({
    mutationFn: async (data: ExtractedCV) => {
      const response = await fetch(`/api/cvs/${cvId}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const value = await response.json();

      if (!response.ok)
        throw new Error(value.error ?? "The request failed. Please try again.");

      return value;
    },
  });
}
