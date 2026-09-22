import assert from "node:assert/strict";
import { resolveAts } from "../lib/jobs/ats-adapter";

async function main() {
  const gh = resolveAts("https://boards.greenhouse.io/acme/jobs/123");
  assert.equal(gh?.adapter.ats, "greenhouse");
  assert.equal(gh?.sourceURL, "https://job-boards.greenhouse.io/acme/jobs/123");

  const ghEu = resolveAts("https://job-boards.eu.greenhouse.io/acme/jobs/123");
  assert.equal(ghEu?.adapter.ats, "greenhouse");

  const ashby = resolveAts("https://jobs.ashbyhq.com/acme/abc-123-def");
  assert.equal(ashby?.adapter.ats, "ashby");
  assert.equal(ashby?.sourceURL, "https://jobs.ashbyhq.com/acme/abc-123-def");

  const lever = resolveAts("https://jobs.lever.co/acme/abc-123-def");
  assert.equal(lever?.adapter.ats, "lever");
  assert.equal(lever?.sourceURL, "https://jobs.lever.co/acme/abc-123-def/apply");

  const leverApply = resolveAts("https://jobs.lever.co/acme/abc-123-def/apply");
  assert.equal(leverApply?.sourceURL, "https://jobs.lever.co/acme/abc-123-def/apply");

  const leverEu = resolveAts("https://jobs.eu.lever.co/acme/abc-123-def");
  assert.equal(leverEu?.adapter.ats, "lever");

  for (const url of [
    "https://example.com/jobs/123",
    "https://jobs.ashbyhq.com.evil.com/acme/abc",
    "https://jobs.lever.co/acme",
    "not a url",
    "http://jobs.ashbyhq.com/acme/abc",
  ]) {
    assert.equal(resolveAts(url), null, url);
  }

  assert.deepEqual(
    new Set((await import("../lib/jobs/ats-adapter")).adapters.map((a) => a.ats)),
    new Set(["greenhouse", "ashby", "lever"]),
  );

  console.log("ATS adapter tests passed: resolveAts dispatches each platform correctly and rejects unknown hosts.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
