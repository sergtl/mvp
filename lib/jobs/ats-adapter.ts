import type { Page, Locator } from "playwright";
import type { SubmissionInput, SubmissionFile } from "../submissions/types";
import type { ImportedJob } from "./types";

export type AtsName = "greenhouse" | "ashby" | "lever";

export type AtsAdapter = {
  ats: AtsName;
  // Hosts the submit-time browser is ever allowed to navigate to. Enforced by
  // submitInBrowser's navigation allowlist, same security property regardless
  // of which adapter is active.
  allowedHosts: string[];
  // Cheap, no network: does this URL belong to this ATS, and if so what's its
  // canonical sourceURL? Never throws — resolveAts tries adapters in turn.
  parseURL(input: string): { sourceURL: string } | null;
  // Greenhouse: a plain HTTP call, `page` is ignored either way. Ashby/Lever:
  // no public API exposes the question schema, so this reads it out of the
  // live DOM instead — navigating its own throwaway browser page when none is
  // given (standalone, e.g. Prepare time), or reading the given page in place
  // when one is (submit time, so it shares the same session `fill` is about
  // to use instead of opening a second browser back to back).
  fetchForm(sourceURL: string, page?: Page): Promise<ImportedJob>;
  // Interacts with the live, already-navigated page. Returns the question
  // labels that could not be resolved/filled.
  fill(page: Page, snapshot: SubmissionInput, files: SubmissionFile[]): Promise<string[]>;
  submitButton(page: Page): Promise<Locator>;
  isConfirmed(page: Page): Promise<boolean>;
};

// Import path, not a re-export from index.ts: keeps each adapter file the
// single owner of its own selectors/API shape, this file only the registry.
import { greenhouseAdapter } from "./greenhouse";
import { ashbyAdapter } from "./ashby";
import { leverAdapter } from "./lever";

export const adapters: AtsAdapter[] = [greenhouseAdapter, ashbyAdapter, leverAdapter];

export function resolveAts(input: string): { adapter: AtsAdapter; sourceURL: string } | null {
  for (const adapter of adapters) {
    const parsed = adapter.parseURL(input);
    if (parsed) return { adapter, sourceURL: parsed.sourceURL };
  }
  return null;
}
