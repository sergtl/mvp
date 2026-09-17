import assert from "node:assert/strict";
import { fetchGreenhouseJob, normalizeJob, parseGreenhouseURL, plainText, JobImportError } from "../lib/jobs/greenhouse";

async function main() {
for (const host of ["boards.greenhouse.io", "job-boards.greenhouse.io"]) {
  assert.equal(parseGreenhouseURL(`https://${host}/acme/jobs/123?gh_src=abc#app`).apiURL, "https://boards-api.greenhouse.io/v1/boards/acme/jobs/123?questions=true");
}
assert.match(parseGreenhouseURL("https://boards.eu.greenhouse.io/embed/job_app?for=acme&token=123").apiURL, /boards-api.eu.greenhouse.io/);
for (const url of ["https://localhost/jobs/123", "https://boards.greenhouse.io.evil.com/acme/jobs/123", "https://user@boards.greenhouse.io/acme/jobs/123", "http://boards.greenhouse.io/acme/jobs/123", "https://boards.greenhouse.io/acme", "https://boards.greenhouse.io/embed/job_app?for=../../evil&token=123"]) {
  assert.throws(() => parseGreenhouseURL(url), JobImportError);
}
assert.equal(plainText("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;p&gt;Second paragraph&lt;/p&gt;"), "Hello & welcome\n\nSecond paragraph");
assert.equal(plainText("<script>alert(1)</script><p>Safe</p>"), "Safe");
const payload = {
  id: 123, title: "Engineer", content: "&lt;p&gt;Build things&lt;/p&gt;",
  questions: [{ label: "Resume", required: true, fields: [{ name: "resume", type: "input_file" }, { name: "resume_text", type: "textarea" }] },
    { label: "Eligible?", required: true, fields: [{ name: "question_1", type: "multi_value_single_select", values: [{ value: 0, label: "No" }, { value: 1, label: "Yes" }] }] }],
  location_questions: [{ label: "Latitude", required: true, fields: [{ name: "latitude", type: "input_hidden" }] }],
  compliance: [{ type: "eeoc", description: "&lt;p&gt;Voluntary&lt;/p&gt;", questions: [{ label: "Gender", required: false, fields: [{ name: "gender", type: "multi_value_single_select", values: [{ value: "3", label: "Decline" }] }] }] }],
  demographic_questions: { header: "Demographics", questions: [{ id: 4, label: "Identity", required: false, type: "multi_value_multi_select", answer_options: [{ id: 5, label: "Other", free_form: true }] }] },
  data_compliance: [{ type: "gdpr", requires_processing_consent: false, requires_retention_consent: false }],
};
const job = normalizeJob(payload, "https://job-boards.greenhouse.io/acme/jobs/123");
assert.equal(job.sections.length, 4);
assert.equal(job.sections[0].questions[0].fields.length, 2);
assert.equal(job.sections[0].questions[1].fields[0].options[0].value, "0");
assert.equal(job.sections[2].description, "Voluntary");
assert.equal(job.sections[3].questions[0].fields[0].options[0].freeForm, true);
assert.throws(() => normalizeJob({ id: 123 }, ""), JobImportError);
const fetched = await fetchGreenhouseJob("https://boards.greenhouse.io/acme/jobs/123", async (url, init) => {
  assert.equal(String(url), "https://boards-api.greenhouse.io/v1/boards/acme/jobs/123?questions=true");
  assert.equal(init?.redirect, "error");
  return Response.json(payload);
});
assert.equal(fetched.title, "Engineer");
for (const status of [404, 429, 500]) {
  await assert.rejects(fetchGreenhouseJob("https://boards.greenhouse.io/acme/jobs/123", async () => new Response(null, { status })), (error: unknown) => error instanceof JobImportError && error.status === (status === 500 ? 502 : status));
}
console.log("Greenhouse tests passed: URL safety, encoded descriptions, question groups, options, consent, and upstream errors.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
