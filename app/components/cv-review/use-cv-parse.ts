"use client";

import { useQuery } from "@tanstack/react-query";
import type { ParseResponse } from "@/lib/cv/extraction-schema";

export const cvParseKey = (userId: string, cvId: string) =>
  ["cv-parse", userId, cvId] as const;

// Polls while parsing is queued or running.
export function useCvParse(cvId: string, userId: string) {
  return useQuery<ParseResponse>({
    queryKey: cvParseKey(userId, cvId),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/cvs/${cvId}/parse`, { signal });
      const value = await response.json();

      if (!response.ok)
        throw new Error(value.error ?? "The request failed. Please try again.");

      return value;
    },
    refetchInterval: (q) =>
      ["queued", "processing"].includes(q.state.data?.parse?.status ?? "")
        ? 3000
        : false,
    refetchOnWindowFocus: false,
  });
}
