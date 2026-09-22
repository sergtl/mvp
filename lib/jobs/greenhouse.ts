import { z } from "zod";
import { convert } from "html-to-text";

export class JobImportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// Never fetch a user-supplied host. Extract identifiers and build a fixed API URL.
export function parseGreenhouseURL(input: string) {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new JobImportError("Enter a valid Greenhouse job URL.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    ![
      "boards.greenhouse.io",
      "job-boards.greenhouse.io",
      "boards.eu.greenhouse.io",
      "job-boards.eu.greenhouse.io",
    ].includes(url.hostname)
  ) {
    throw new JobImportError(
      "Use the direct Greenhouse job link (boards.greenhouse.io or job-boards.greenhouse.io), rather than a company careers page.",
    );
  }

  const match = url.pathname.match(/^\/([\w-]+)\/jobs\/(\d+)\/?$/);

  const embed = /^\/embed\/job_app\/?$/.test(url.pathname);

  const board = match?.[1] ?? (embed ? url.searchParams.get("for") : null);

  const id = match?.[2] ?? (embed ? url.searchParams.get("token") : null);

  if (!board || !/^[\w-]+$/.test(board) || !id || !/^\d+$/.test(id)) {
    throw new JobImportError(
      "This link does not identify a Greenhouse job. Paste the full job posting URL.",
    );
  }

  const region = url.hostname.includes(".eu.") ? ".eu" : "";

  return {
    apiURL: `https://boards-api${region}.greenhouse.io/v1/boards/${board}/jobs/${id}?questions=true`,
    sourceURL: `https://job-boards${region}.greenhouse.io/${board}/jobs/${id}`,
  };
}

const identifier = z.union([z.string(), z.number()]).transform(String);

const option = z.object({ value: identifier, label: z.string() });

const field = z.object({
  name: z.string(),
  type: z.string(),
  values: z.array(option).nullish(),
});

const question = z.object({
  label: z.string(),
  required: z.boolean().default(false),
  description: z.string().nullish(),
  fields: z.array(field),
});

// TODO: confirm whether this is the correct return format by greenhouse
const jobSchema = z.object({
  id: identifier,
  title: z.string(),
  company_name: z.string().nullish(),
  content: z.string(),
  location: z.object({ name: z.string() }).nullish(),
  questions: z.array(question),
  location_questions: z.array(question).nullish(),
  compliance: z
    .array(
      z.union([
        question,
        z.object({
          type: z.string(),
          description: z.string().nullish(),
          questions: z.array(question),
        }),
      ]),
    )
    .nullish(),
  demographic_questions: z
    .object({
      header: z.string().optional(),
      description: z.string().optional(),
      questions: z.array(
        z.object({
          id: identifier,
          label: z.string(),
          required: z.boolean().default(false),
          type: z.string(),
          answer_options: z.array(
            z.object({
              id: identifier,
              label: z.string(),
              free_form: z.boolean().default(false),
            }),
          ),
        }),
      ),
    })
    .nullish(),
  data_compliance: z
    .array(
      z.object({
        type: z.string(),
        requires_consent: z.boolean().optional(),
        requires_processing_consent: z.boolean().optional(),
        requires_retention_consent: z.boolean().optional(),
        retention_period: z.number().nullish(),
        demographic_data_consent_applies: z.boolean().optional(),
      }),
    )
    .nullish(),
  ai_disclaimer: z.string().nullish(),
});

export type JobField = {
  name: string;
  type: string;
  options: { value: string; label: string; freeForm?: boolean }[];
};

export type JobQuestion = {
  label: string;
  required: boolean;
  description: string;
  fields: JobField[];
};

export type JobSection = {
  title: string;
  description: string;
  questions: JobQuestion[];
};

export type ImportedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  sourceURL: string;
  sections: JobSection[];
};

export function plainText(html: string) {
  // Greenhouse can return entity-encoded markup. Decode its outer layer before
  // converting the markup; React renders the result strictly as text.
  let value = html;
  for (let i = 0; i < 2 && /&(?:amp;)?lt;\/?[a-z]/i.test(value); i++) {
    value = convert(value, {
      wordwrap: false,
      selectors: [{ selector: "*", format: "inline" }],
    });
  }
  return convert(value, { wordwrap: false });
}

export function normalizeJob(payload: unknown, sourceURL: string): ImportedJob {
  const parsed = jobSchema.safeParse(payload);

  if (!parsed.success)
    throw new JobImportError(
      "Greenhouse returned an application format we could not read.",
      502,
    );

  const job = parsed.data;

  const sections: JobSection[] = [];

  const groups = [
    { title: "Application", description: "", questions: job.questions },
    { title: "Location", description: "", questions: job.location_questions },
    ...(job.compliance ?? []).map((item) => ({
      title: "Equal opportunity",
      description: "questions" in item ? (item.description ?? "") : "",
      questions: "questions" in item ? item.questions : [item],
    })),
  ];

  for (const { title, description, questions } of groups) {
    if (questions?.length || description)
      sections.push({
        title,
        description: plainText(description),
        questions: (questions ?? []).map((q) => ({
          label: plainText(q.label),
          required: q.required,
          description: plainText(q.description ?? ""),
          fields: q.fields.map((f) => ({
            name: f.name,
            type: f.type,
            options: (f.values ?? []).map((o) => ({
              ...o,
              label: plainText(o.label),
            })),
          })),
        })),
      });
  }

  const demographics = job.demographic_questions;

  if (demographics?.questions.length)
    sections.push({
      title: plainText(demographics.header ?? "Demographic questions"),
      description: plainText(demographics.description ?? ""),
      questions: demographics.questions.map((q) => ({
        label: plainText(q.label),
        required: q.required,
        description: "",
        fields: [
          {
            name: `demographic_${q.id}`,
            type: q.type,
            options: q.answer_options.map((o) => ({
              value: o.id,
              label: plainText(o.label),
              freeForm: o.free_form,
            })),
          },
        ],
      })),
    });

  for (const consent of job.data_compliance ?? []) {
    const questions: JobQuestion[] = [];

    const add = (name: string, label: string, required: boolean) =>
      questions.push({
        label,
        required,
        description: "",
        fields: [{ name, type: "consent", options: [] }],
      });

    const separate =
      consent.requires_processing_consent !== undefined ||
      consent.requires_retention_consent !== undefined;

    if (separate) {
      if (consent.requires_processing_consent)
        add(
          "gdpr_processing_consent_given",
          "I consent to the processing of my application data.",
          true,
        );
      if (consent.requires_retention_consent)
        add(
          "gdpr_retention_consent_given",
          "I consent to the retention of my application data.",
          true,
        );
    } else if (consent.requires_consent)
      add(
        "gdpr_consent_given",
        "I consent to the processing and retention of my application data.",
        true,
      );

    if (consent.demographic_data_consent_applies)
      add(
        "gdpr_demographic_data_consent_given",
        "I consent to the processing of my demographic data.",
        false,
      );

    if (questions.length)
      sections.push({
        title: "Data consent",
        description: `Review the employer’s privacy terms on the original posting.${consent.retention_period ? ` Retention period: ${consent.retention_period} days.` : ""}`,
        questions,
      });
  }

  return {
    id: job.id,
    title: plainText(job.title),
    company: job.company_name ?? "",
    location: job.location?.name ?? "",
    sourceURL,
    description: plainText(
      [job.content, job.ai_disclaimer].filter(Boolean).join("\n"),
    ),
    sections,
  };
}

export async function fetchGreenhouseJob(
  input: string,
  fetcher: typeof fetch = fetch,
) {
  const { apiURL, sourceURL } = parseGreenhouseURL(input);

  try {
    const response = await fetcher(apiURL, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 404)
      throw new JobImportError(
        "This job was not found. It may have closed or the link may be incorrect.",
        404,
      );

    if (response.status === 429)
      throw new JobImportError(
        "Greenhouse is receiving too many requests. Try again shortly.",
        429,
      );

    if (!response.ok)
      throw new JobImportError(
        "Greenhouse could not load this job. Try again shortly.",
        502,
      );

    return normalizeJob(await response.json(), sourceURL);
  } catch (error) {
    if (error instanceof JobImportError) throw error;
    throw new JobImportError(
      "Unable to reach Greenhouse. Please try again.",
      502,
    );
  }
}
