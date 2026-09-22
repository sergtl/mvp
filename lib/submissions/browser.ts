import { chromium, type Page } from "playwright";
import type { SubmissionInput, SubmissionFile, SubmissionStatus } from "./types";
import { resolveAts, type AtsAdapter } from "../jobs/ats-adapter";
import { validateSubmission } from "./validate";

export type Progress = (
  status: SubmissionStatus,
  message: string,
) => Promise<void>;

export class BrowserNotStarted extends Error {}

export async function finishApplication(
  page: Page,
  progress: Progress,
  unresolved: string[],
  adapter: Pick<AtsAdapter, "submitButton" | "isConfirmed">,
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
    const button = await adapter.submitButton(page);

    if ((await button.count()) === 1 && (await button.isEnabled())) {
      await progress("submitting", "Submitting the application…");

      try {
        await button.click();
        // Poll rather than a fixed wait, so a fast confirmation returns
        // immediately instead of always paying the full timeout.
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          if (await adapter.isConfirmed(page)) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch {
        /* CAPTCHA or custom form validation may need user input. */
      }
      if (await adapter.isConfirmed(page)) return "submitted" as const;
    }
  }

  await progress(
    "needs_input",
    `${unresolved.length ? `Needs attention: ${unresolved.join(", ").slice(0, 1000)}. ` : ""}Finish missing fields or CAPTCHA in the worker's browser, then submit there. Keep the browser open until confirmation. You have five minutes.`,
  );

  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline && !page.isClosed()) {
    if (await adapter.isConfirmed(page)) return "submitted" as const;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return "needs_verification" as const;
}

export async function submitInBrowser(
  snapshot: SubmissionInput,
  files: SubmissionFile[],
  progress: Progress,
): Promise<"submitted" | "needs_verification"> {
  const resolved = resolveAts(snapshot.job.sourceURL);
  if (!resolved) throw new BrowserNotStarted("This job board is not supported.");
  const { adapter, sourceURL } = resolved;

  let browser;

  try {
    browser = await chromium.launch({ headless: false });
  } catch {
    throw new BrowserNotStarted(
      "The browser could not start. Install Chromium and try again.",
    );
  }
  try {
    const context = await browser.newContext();
    // Keep navigations on this ATS's own hosts; never follow arbitrary
    // job-content links off the application.
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.isNavigationRequest() &&
        request.frame() === request.frame().page().mainFrame()
      ) {
        const url = new URL(request.url());
        if (url.protocol !== "https:" || !adapter.allowedHosts.includes(url.hostname))
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

    // Re-read the live form on this same session (not a second browser) and
    // diff it against the draft: trust nothing between draft time and now.
    const live = await adapter.fetchForm(sourceURL, page);

    validateSubmission(
      snapshot,
      live,
      new Set(files.map((file) => file.fieldId)),
    );

    const unresolved = await adapter.fill(page, snapshot, files);

    return await finishApplication(page, progress, unresolved, adapter);
  } finally {
    await browser.close();
  }
}
