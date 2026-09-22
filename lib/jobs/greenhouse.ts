import { z } from "zod";
import { convert } from "html-to-text";
import type { Page, Locator } from "playwright";
import type { AtsAdapter } from "./ats-adapter";
import type { SubmissionInput, SubmissionFile } from "../submissions/types";
import { JobImportError } from "./types";
import type { ImportedJob, JobField, JobQuestion, JobSection } from "./types";

export { JobImportError };
export type { ImportedJob, JobField, JobQuestion, JobSection };

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
            category: "demographic",
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
        fields: [{ name, type: "consent", category: "consent", options: [] }],
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

const HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "boards.eu.greenhouse.io",
  "job-boards.eu.greenhouse.io",
];

const confirmation =
  /thank you for applying|thank you for your application|application (?:has been |was )?(?:successfully )?(?:submitted|received)|we have received your application/i;

export async function isConfirmed(page: Page) {
  // A generic "thank you" in the job description must never count as a receipt.
  const formVisible =
    (await page
      .locator(
        'input[type="email"], input[name="first_name"], input#first_name, input#email',
      )
      .filter({ visible: true })
      .count()) > 0;
  const receipt = page.getByRole("heading").filter({ hasText: confirmation });

  if (
    await receipt
      .first()
      .isVisible()
      .catch(() => false)
  )
    return !formVisible;

  const confirmed = page.locator(
    '#application_confirmation, #confirmation, [data-testid="application-confirmation"]',
  );

  return (
    !formVisible &&
    (await confirmed
      .filter({ hasText: confirmation })
      .first()
      .isVisible()
      .catch(() => false))
  );
}

async function findField(
  page: Page,
  name: string,
  label: string,
): Promise<Locator> {
  if (
    name === "location" &&
    (await page.locator("#candidate-location").count()) === 1
  )
    return page.locator("#candidate-location");

  // Greenhouse renders these textareas only after switching the upload widget.
  if (["resume_text", "cover_letter_text"].includes(name)) {
    const manual = page.getByTestId(name.replace("_text", "-text"));
    const textarea = page.locator(`textarea[id=${JSON.stringify(name)}]`);
    if (
      !(await textarea.isVisible().catch(() => false)) &&
      (await manual.count()) === 1
    ) {
      await manual.click();
      await textarea.waitFor({ state: "visible" });
    }
  }

  const names = [
    name,
    `job_application[${name}]`,
    `${name}[]`,
    `job_application[${name}][]`,
  ];

  const exact = page.locator(
    names.map((n) => `[name=${JSON.stringify(n)}]`).join(","),
  );

  if (await exact.count()) {
    const visible = exact.filter({ visible: true });
    if ((await visible.count()) === 1) return visible;
    if ((await exact.count()) === 1) return exact;
  }

  const byId = page.locator(`[id=${JSON.stringify(name)}]`);

  if ((await byId.count()) === 1) return byId;

  const byLabel = page.getByLabel(label, { exact: true });

  if ((await byLabel.count()) === 1) return byLabel;

  throw new Error("field_not_found");
}

export async function fillApplication(
  page: Page,
  snapshot: SubmissionInput,
  files: SubmissionFile[],
) {
  // Inputs in the server HTML are visible before React has attached its event
  // handlers. Waiting for a visible input alone can lose every early answer.
  await page.waitForLoadState("load");
  // Greenhouse loads the form/upload client after the document. Bound the wait
  // because analytics and CAPTCHA can keep connections open indefinitely.
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
  // Confirm this really rendered a Greenhouse-shaped form before interacting.
  await page
    .locator('input[name="first_name"], input#first_name, input[type="email"]')
    .first()
    .waitFor({ timeout: 20000 });

  const unresolved: string[] = [];
  const textChecks: { name: string; label: string; value: string }[] = [];

  for (const [s, section] of snapshot.job.sections.entries()) {
    for (const [q, question] of section.questions.entries()) {
      for (const [f, field] of question.fields.entries()) {
        const id = `${s}-${q}-${f}`;
        const file = files.find((file) => file.fieldId === id);
        const value = snapshot.answers[id];
        if (
          field.type === "input_hidden" ||
          (!file &&
            (value === undefined ||
              value === "" ||
              (Array.isArray(value) && !value.length)))
        )
          continue;
        try {
          const control = await findField(page, field.name, question.label);
          if (file) {
            const greenhouseUpload =
              (await control
                .locator(
                  'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " file-upload ")]',
                )
                .count()) > 0;

            await control.setInputFiles({
              name: file.filename,
              mimeType: file.contentType,
              buffer: file.content,
            });

            if (greenhouseUpload) {
              // The native input can contain a File while Greenhouse is still
              // uploading it (or its upload client failed to initialize).
              await page
                .getByText(file.filename, { exact: true })
                .first()
                .waitFor({ state: "visible", timeout: 30000 });
            }
          } else if (field.type === "consent") {
            await control.setChecked(value === true);
          } else if (field.type.startsWith("multi_value_")) {
            const values = Array.isArray(value) ? value : [String(value)];
            const tag = await control.evaluate((el) =>
              el.tagName.toLowerCase(),
            );

            if (tag === "select") {
              await control.selectOption(values);
            } else if ((await control.getAttribute("role")) === "combobox") {
              // Modern Greenhouse uses searchable React select controls.
              for (const selected of values) {
                const option = field.options.find((o) => o.value === selected);
                if (!option) throw new Error("unknown_option");

                await control.click();
                await control.fill(option.label);
                await page
                  .getByRole("option", { name: option.label, exact: true })
                  .click();
              }
            } else {
              for (const selected of values) {
                const option = field.options.find((o) => o.value === selected);
                if (!option) throw new Error("unknown_option");
                await page.getByLabel(option.label, { exact: true }).check();
              }
            }
            // Free-form option text has board-specific markup: ask the user rather
            // than guessing and sending an incomplete answer.
            if (
              values.some(
                (v) => field.options.find((o) => o.value === v)?.freeForm,
              )
            )
              throw new Error("free_form");
          } else {
            await control.fill(String(value));
            await control.blur();

            textChecks.push({
              name: field.name,
              label: question.label,
              value: String(value),
            });

            if (field.name === "location")
              throw new Error("location_needs_selection");
          }
        } catch {
          unresolved.push(question.label);
        }
      }
    }
  }
  // A late render can reset a previously filled controlled input. Refill once
  // and verify, rather than silently submitting missing answers.
  for (const check of textChecks) {
    if (check.name === "location") continue;

    try {
      const control = await findField(page, check.name, check.label);
      const matches = (actual: string) =>
        check.name === "phone"
          ? actual.replace(/\D/g, "") === check.value.replace(/\D/g, "")
          : actual === check.value;

      if (!matches(await control.inputValue())) {
        await control.fill(check.value);
        await control.blur();
      }

      if (!matches(await control.inputValue())) unresolved.push(check.label);
    } catch {
      unresolved.push(check.label);
    }
  }
  return [...new Set(unresolved)];
}

export const greenhouseAdapter: AtsAdapter = {
  ats: "greenhouse",
  allowedHosts: HOSTS,
  parseURL(input) {
    try {
      return { sourceURL: parseGreenhouseURL(input).sourceURL };
    } catch {
      return null;
    }
  },
  // `page` is ignored: Greenhouse's form is always a plain HTTP call, whether
  // this is a standalone Prepare-time fetch or the submit-time drift-check.
  fetchForm(sourceURL) {
    return fetchGreenhouseJob(sourceURL);
  },
  fill: fillApplication,
  isConfirmed,
  async submitButton(page: Page) {
    return page.getByRole("button", {
      name: /^(submit application|submit|apply now)$/i,
    });
  },
};
