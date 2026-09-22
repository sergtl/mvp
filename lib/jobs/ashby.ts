import type { Page } from "playwright";
import { chromium } from "playwright";
import type { AtsAdapter } from "./ats-adapter";
import { JobImportError, type ImportedJob } from "./types";
import { readDomForm, fillDomForm, isGenericConfirmation, resolveFormRoot, hasVisibleFields } from "./dom-form";

// Verified against a real posting (jobs.ashbyhq.com/searchapi/...): the
// hosted board page defaults to an "Overview" tab; the actual application
// form lives under a separate role="tab" link with accessible name
// "Application" and isn't rendered at all until that tab is clicked (not
// just hidden - zero matching elements exist beforehand). No iframe is
// present on this page at all - the earlier "confirmed JS/iframe-rendered"
// assumption was carried over from research about Ashby's *embeddable*
// widget (for a company's own custom careers page), which doesn't apply to
// Ashby's own default-hosted board page. resolveFormRoot still checks for an
// iframe defensively (shared with Lever), since an embedded posting reached
// through a company's own domain may yet need it.

const HOST = "jobs.ashbyhq.com";

export function parseAshbyURL(input: string): { sourceURL: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hostname !== HOST) return null;

  // Trailing segments (e.g. an apply-page variant) aren't rejected: Ashby's
  // own public API separately returns jobUrl and applyUrl, so a view-vs-apply
  // URL split likely exists here too, even without a confirmed exact suffix.
  const match = url.pathname.match(/^\/([\w-]+)\/([\w-]+)(?:\/.*)?$/);
  if (!match) return null;

  return { sourceURL: `https://${HOST}/${match[1]}/${match[2]}` };
}

async function waitForForm(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  let root = await resolveFormRoot(page);

  if (!(await hasVisibleFields(root))) {
    const applicationTab = page.getByRole("tab", { name: /application/i });
    if (await applicationTab.count().catch(() => 0)) {
      await applicationTab.first().click();
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      root = await resolveFormRoot(page);
    }
  }

  await root
    .locator("input, select, textarea")
    .filter({ visible: true })
    .first()
    .waitFor({ state: "visible", timeout: 20000 });
  return root;
}

async function fetchForm(sourceURL: string, page?: Page): Promise<ImportedJob> {
  const owns = !page;
  // Read-only: nothing here needs a human, unlike the submit-time browser.
  const browser = owns ? await chromium.launch({ headless: true }) : undefined;

  try {
    const activePage = page ?? (await (await browser!.newContext()).newPage());
    if (owns) await activePage.goto(sourceURL, { waitUntil: "domcontentloaded", timeout: 30000 });

    const root = await waitForForm(activePage);
    const title = (await activePage.title()) || "";
    const sections = await readDomForm(root);

    return {
      id: sourceURL,
      title,
      company: sourceURL.split("/")[3] ?? "",
      location: "",
      description: "",
      sourceURL,
      sections,
    };
  } catch {
    throw new JobImportError("Unable to load this Ashby application form.", 502);
  } finally {
    if (owns) await browser!.close();
  }
}

export const ashbyAdapter: AtsAdapter = {
  ats: "ashby",
  allowedHosts: [HOST],
  parseURL: parseAshbyURL,
  fetchForm,
  async fill(page, snapshot, files) {
    const root = await waitForForm(page);
    return fillDomForm(root, snapshot, files);
  },
  async submitButton(page) {
    const root = await resolveFormRoot(page);
    return root.getByRole("button", { name: /^(submit application|apply|submit)$/i });
  },
  async isConfirmed(page) {
    return isGenericConfirmation(await resolveFormRoot(page));
  },
};
