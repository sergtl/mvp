"use client";

import { useQuery } from "@tanstack/react-query";
import type { SetupState } from "@/lib/onboarding/steps";

// Polls while a CV is being read; otherwise a single fetch, refreshed when
// the tab regains focus (e.g. after uploading elsewhere or editing the profile).
export function useSetupState(userId: string) {
  return useQuery<SetupState>({
    queryKey: ["setup", userId],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/setup", { signal });

      if (!response.ok) throw new Error("Unable to load your setup.");

      return response.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      const status = q.state.data?.parse?.status;

      return status === "queued" || status === "processing" ? 3000 : false;
    },
  });
}
