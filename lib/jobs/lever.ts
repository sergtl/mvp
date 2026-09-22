import type { Page } from "playwright";
import { chromium } from "playwright";
import type { AtsAdapter } from "./ats-adapter";
import { JobImportError, type ImportedJob } from "./types";
import { readDomForm, fillDomForm, isGenericConfirmation, resolveFormRoot } from "./dom-form";

// Lever's public Postings API explicitly does not expose custom application
// questions ("The API does not: Expose custom questions built into your job
// postings" - lever/postings-api README), so the question schema is read
// from the live apply-page DOM. Verified against a real posting
// (jobs.lever.co/getmidas/.../apply): the form itself renders top-level, no
// iframe - resolveFormRoot's page-first check finds it directly. An earlier
// version of this adapter used a naive "first iframe with any matching
// elements" check, which on this posting picked up hCaptcha's own hidden
// iframe instead of the real form; fixed in dom-form.ts.

const HOSTS = ["jobs.lever.co", "jobs.eu.lever.co"];
const API_HOSTS: Record<string, string> = { "jobs.lever.co": "api.lever.co", "jobs.eu.lever.co": "api.eu.lever.co" };

export function parseLeverURL(input: string): { sourceURL: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || !HOSTS.includes(url.hostname)) return null;

  const match = url.pathname.match(/^\/([\w-]+)\/([\w-]+)(?:\/.*)?$/);
  if (!match) return null;

  // The apply page (not the bare posting URL, which may just show a
  // description) is confirmed to be where the actual form lives.
  return { sourceURL: `https://${url.hostname}/${match[1]}/${match[2]}/apply` };
}

async function fetchPostingContent(sourceURL: string) {
  const url = new URL(sourceURL);
  const [, site, postingId] = url.pathname.split("/");
  const apiHost = API_HOSTS[url.hostname];

  try {
    const response = await fetch(`https://${apiHost}/v0/postings/${site}/${postingId}?mode=json`, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    // Lever's public API has a known bug where mode=json can return HTML.
    if (!contentType.includes("json")) return null;
    const data = await response.json();
    return {
      title: typeof data.text === "string" ? data.text : "",
      company: site,
      location: typeof data.categories?.location === "string" ? data.categories.location : "",
      description: [data.descriptionPlain, data.additionalPlain].filter(Boolean).join("\n"),
    };
  } catch {
    return null;
  }
}

async function waitForForm(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const root = await resolveFormRoot(page);
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
    const [content, activePage] = await Promise.all([
      fetchPostingContent(sourceURL),
      (async () => {
        const activePage = page ?? (await (await browser!.newContext()).newPage());
        if (owns) await activePage.goto(sourceURL, { waitUntil: "domcontentloaded", timeout: 30000 });
        return activePage;
      })(),
    ]);

    const root = await waitForForm(activePage);
    const sections = await readDomForm(root);

    return {
      id: sourceURL,
      title: content?.title || (await activePage.title()) || "",
      company: content?.company ?? sourceURL.split("/")[3] ?? "",
      location: content?.location ?? "",
      description: content?.description ?? "",
      sourceURL,
      sections,
    };
  } catch {
    throw new JobImportError("Unable to load this Lever application form.", 502);
  } finally {
    if (owns) await browser!.close();
  }
}

export const leverAdapter: AtsAdapter = {
  ats: "lever",
  allowedHosts: [...HOSTS, ...Object.values(API_HOSTS)],
  parseURL: parseLeverURL,
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
