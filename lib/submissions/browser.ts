import { chromium, type Page, type Locator } from "playwright";
import type {
  SubmissionInput,
  SubmissionFile,
  SubmissionStatus,
} from "./types";
import { fetchGreenhouseJob, parseGreenhouseURL } from "../jobs/greenhouse";
import { validateSubmission } from "./validate";

export type Progress = (
  status: SubmissionStatus,
  message: string,
) => Promise<void>;

const confirmation =
  /thank you for applying|thank you for your application|application (?:has been |was )?(?:successfully )?(?:submitted|received)|we have received your application/i;

export class BrowserNotStarted extends Error {}

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

export async function finishApplication(
  page: Page,
  progress: Progress,
  unresolved: string[],
  waitMs = 5 * 60_000,
) {
  // From this point onwards a human or the worker may submit. Never auto-retry.
  if (!unresolved.length) {
    const invalid = await page
      .locator(
        'input:invalid, select:invalid, textarea:invalid, [aria-invalid="true"]',
      )
      .filter({ visible: true })
      .count();

    if (invalid)
      unresolved.push(
        "Required fields or validation errors on the original form",
      );
  }
  if (!unresolved.length) {
    const button = page.getByRole("button", {
      name: /^(submit application|submit|apply now)$/i,
    });

    if ((await button.count()) === 1 && (await button.isEnabled())) {
      await progress("submitting", "Submitting the application on Greenhouse…");

      try {
        await button.click();

        await page.waitForFunction(
          () => {
            const receipt = document.querySelector(
              '#application_confirmation, #confirmation, [data-testid="application-confirmation"]',
            );
            return !!receipt || !document.querySelector("form");
          },
          null,
          { timeout: 3000 },
        );
      } catch {
        /* CAPTCHA or custom form validation may need user input. */
      }
      if (await isConfirmed(page)) return "submitted" as const;
    }
  }

  await progress(
    "needs_input",
    `${unresolved.length ? `Needs attention: ${unresolved.join(", ").slice(0, 1000)}. ` : ""}Finish missing fields or CAPTCHA in the worker's browser, then submit there. Keep the browser open until confirmation. You have five minutes.`,
  );

  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline && !page.isClosed()) {
    if (await isConfirmed(page)) return "submitted" as const;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return "needs_verification" as const;
}

export async function submitInBrowser(
  snapshot: SubmissionInput,
  files: SubmissionFile[],
  progress: Progress,
): Promise<"submitted" | "needs_verification"> {
  const sourceURL = parseGreenhouseURL(snapshot.job.sourceURL).sourceURL;
  let browser;

  try {
    const live = await fetchGreenhouseJob(sourceURL);

    validateSubmission(
      snapshot,
      live,
      new Set(files.map((file) => file.fieldId)),
    );

    browser = await chromium.launch({ headless: false });
  } catch {
    throw new BrowserNotStarted(
      "The job could not be checked or the browser could not start. Check the job, install Chromium, and try again.",
    );
  }
  try {
    const context = await browser.newContext();
    // Keep navigations on Greenhouse; never follow arbitrary job-content links.
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.isNavigationRequest() &&
        request.frame() === request.frame().page().mainFrame()
      ) {
        const url = new URL(request.url());
        if (
          url.protocol !== "https:" ||
          ![
            "boards.greenhouse.io",
            "job-boards.greenhouse.io",
            "boards.eu.greenhouse.io",
            "job-boards.eu.greenhouse.io",
          ].includes(url.hostname)
        )
          return route.abort();
      }
      await route.continue();
    });

    const page = await context.newPage();
    page.setDefaultTimeout(5000);

    await page.goto(sourceURL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page
      .locator(
        'input[name="first_name"], input#first_name, input[type="email"]',
      )
      .first()
      .waitFor({ timeout: 20000 });

    const unresolved = await fillApplication(page, snapshot, files);

    return await finishApplication(page, progress, unresolved);
  } finally {
    await browser.close();
  }
}
