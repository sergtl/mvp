import type { SubmissionStatus } from "@/lib/submissions/types";

export const applicationStatusLabels: Record<SubmissionStatus, string> = {
  queued: "Queued",
  processing: "Preparing application",
  needs_input: "Needs input",
  submitting: "Submitting",
  submitted: "Applied",
  failed: "Failed",
  needs_verification: "Needs verification",
};

export type ApplicationSummary = {
  id: string;
  title: string;
  company: string;
  sourceURL: string;
  status: SubmissionStatus;
};
