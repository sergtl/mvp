import { z } from "zod";

// Empty strings/arrays mean the source did not state a value. Keep dates as
// written (e.g. "2020", "March 2021", "Present") rather than inventing precision.
const text = z.string().max(10000);

export const extractedCVSchema = z.object({
  contact: z.object({
    name: text,
    email: text,
    phone: text,
    location: text,
    links: z.array(text).max(30),
  }),
  summary: text,
  experience: z
    .array(
      z.object({
        company: text,
        title: text,
        startDate: text,
        endDate: text,
        description: text,
      }),
    )
    .max(100),
  education: z
    .array(
      z.object({
        institution: text,
        qualification: text,
        startDate: text,
        endDate: text,
      }),
    )
    .max(100),
  skills: z.array(text).max(200),
  languages: z.array(text).max(100),
});

export type ExtractedCV = z.infer<typeof extractedCVSchema>;

export type ParseStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "needs_ocr";

export type ParseResponse = {
  parse: {
    id: string;
    status: ParseStatus;
    rawText: string | null;
    extractedData: ExtractedCV | null;
    errorCode: string | null;
    createdAt: string;
  } | null;
  review: { data: ExtractedCV; updatedAt: string } | null;
};

export const parseErrors: Record<string, string> = {
  needs_ocr:
    "This PDF has too little readable text. Please upload a text-based PDF.",
  invalid_pdf:
    "This PDF could not be read. It may be damaged or password-protected.",
  pdf_limit: "This PDF exceeds the 30-page or 100,000-character parsing limit.",
  pdf_timeout: "Reading this PDF took too long. Please upload a simpler PDF.",
  ai_refused:
    "AI extraction could not process this document. Please try another CV.",
  ai_failed: "AI extraction failed. Please try again.",
  ai_billing:
    "AI extraction is unavailable because the OpenAI API account has no available credits or quota. Check API billing before retrying.",
  ai_credentials:
    "AI extraction is unavailable because the OpenAI API key was rejected. Check the worker configuration before retrying.",
  ai_access:
    "AI extraction is unavailable because the configured OpenAI model or project is not accessible. Check the worker configuration before retrying.",
  worker_failed:
    "Processing was interrupted and retries were exhausted. Please try again.",
};
