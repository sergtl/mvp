"use client";

import { useMutation } from "@tanstack/react-query";
import type { ImportedJob } from "@/lib/jobs/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Loads a job's description and application questions. Greenhouse resolves
// instantly (a plain HTTP call, returned directly); Ashby/Lever need a live
// browser to read the form, so the API queues that and this polls until it's
// done - the caller still sees one mutation that eventually resolves either
// way, same contract as before this supported more than one ATS.
export function useImportJob() {
  return useMutation<ImportedJob, Error, string>({
    mutationFn: async (url) => {
      const response = await fetch(`/api/jobs/import?${new URLSearchParams({ url })}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Unable to load this job.");

      if (!("importId" in data)) return data as ImportedJob;

      const { importId } = data as { importId: string };

      for (let attempt = 0; attempt < 40; attempt++) {
        await sleep(3000);

        const poll = await fetch(`/api/jobs/import/${importId}`);
        const polled = await poll.json();

        if (!poll.ok) throw new Error(polled.error ?? "Unable to load this job.");
        if (polled.status === "failed") throw new Error(polled.error ?? "Unable to load this job.");
        if (polled.status === "completed" && polled.job) return polled.job as ImportedJob;
      }

      throw new Error("This is taking longer than expected. Try again shortly.");
    },
    retry: false,
    gcTime: 0,
  });
}
