import { z } from "zod";
import { answerRequestSchema } from "../jobs/answers";

export const submissionInput = z.object({
  job: answerRequestSchema.shape.job,
  answers: z.record(
    z.string().max(100),
    z.union([
      z.string().max(20000),
      z.array(z.string().max(1000)).max(100),
      z.boolean(),
    ]),
  ),
  freeText: z.record(z.string().max(200), z.string().max(10000)),
  attachments: z.record(z.string().max(100), z.object({ cvId: z.uuid() })),
});

export type SubmissionInput = z.infer<typeof submissionInput>;

export type SubmissionStatus =
  | "queued"
  | "processing"
  | "needs_input"
  | "submitting"
  | "submitted"
  | "failed"
  | "needs_verification";

export const activeStatuses: SubmissionStatus[] = [
  "queued",
  "processing",
  "needs_input",
  "submitting",
];

export type SubmissionRecord = {
  id: string;
  status: SubmissionStatus;
  message: string | null;
  createdAt: string;
};

export type SubmissionFile = {
  fieldId: string;
  filename: string;
  contentType: string;
  content: Buffer;
};
