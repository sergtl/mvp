import { useQuery } from "@tanstack/react-query";
import type { ImportedJob } from "@/lib/jobs/greenhouse";
import type { JobRequirements } from "@/lib/jobs/requirements";
import type { Eligibility } from "@/lib/profile/eligibility";

export type EligibilityResponse = {
  requirements: JobRequirements;
  eligibility: Eligibility;
  hasProfile: boolean;
};

// What the posting requires, compared with the user's profile. Refetches when
// the user returns from editing their profile; the reading of the posting is
// cached on the server, so this is cheap.
export function useEligibility(job: ImportedJob, userId: string) {
  return useQuery<EligibilityResponse>({
    queryKey: ["eligibility", userId, job.sourceURL],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/jobs/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: {
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
          },
        }),
        signal,
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Unable to check eligibility.");

      return data;
    },
    retry: false,
    staleTime: 0,
  });
}
