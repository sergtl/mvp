import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fillApplication, finishApplication, isConfirmed } from "../lib/submissions/browser";
import { validateSubmission, SubmissionError } from "../lib/submissions/validate";
import type { SubmissionInput, SubmissionStatus } from "../lib/submissions/types";

export const fixture: SubmissionInput = {
  job: {
    id: "1", title: "Engineer", company: "Fixture", location: "Remote", description: "Fixture only", sourceURL: "https://job-boards.greenhouse.io/fixture/jobs/1",
    sections: [{ title: "Application", description: "", questions: [
      { label: "First name", description: "", required: true, fields: [{ name: "first_name", type: "input_text", options: [] }] },
      { label: "Email", description: "", required: true, fields: [{ name: "email", type: "input_text", options: [] }] },
      { label: "Resume", description: "", required: true, fields: [{ name: "resume", type: "input_file", options: [] }, { name: "resume_text", type: "textarea", options: [] }] },
      { label: "Language", description: "", required: true, fields: [{ name: "question_1", type: "multi_value_single_select", options: [{ value: "0", label: "TypeScript" }, { value: "1", label: "Other", freeForm: true }] }] },
      { label: "Cover letter", description: "", required: false, fields: [{ name: "cover_letter_text", type: "textarea", options: [] }] },
      { label: "Consent", description: "", required: true, fields: [{ name: "consent", type: "consent", options: [] }] },
    ] }],
  },
  answers: { "0-0-0": "Test", "0-1-0": "test@example.invalid", "0-3-0": "0", "0-4-0": "A short cover letter.", "0-5-0": true }, freeText: {}, attachments: {},
};
const bytes = Buffer.from("%PDF-1.4\nSynthetic fixture bytes");
const files = [{ fieldId: "0-2-0", filename: "fixture.pdf", contentType: "application/pdf", content: bytes }];

async function main() {
  validateSubmission(fixture, fixture.job, new Set(["0-2-0"]));
  assert.throws(() => validateSubmission(fixture, fixture.job, new Set()), /Resume/);
  assert.throws(() => validateSubmission({ ...fixture, answers: { ...fixture.answers, "0-3-0": "invalid" } }, fixture.job, new Set(["0-2-0"])), SubmissionError);
  assert.throws(() => validateSubmission({ ...fixture, answers: { ...fixture.answers, "0-5-0": false } }, fixture.job, new Set(["0-2-0"])), /Consent/);
  assert.throws(() => validateSubmission({ ...fixture, answers: { ...fixture.answers, "0-3-0": "1" } }, fixture.job, new Set(["0-2-0"])), /specify/);
  const changed = structuredClone(fixture.job);
  changed.sections[0].questions[0].label = "Different question";
  assert.throws(() => validateSubmission(fixture, changed, new Set(["0-2-0"])), /changed/);
  assert.throws(() => validateSubmission(fixture, fixture.job, new Set(["0-2-0", "0-0-0"])), /file field/);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(1000);
    const html = `<form id="application">
      <label>First name<input name="first_name" required></label>
      <label>Email<input name="email" type="email" required></label>
      <label>Resume<input name="resume" type="file" required></label>
      <label>Language<select name="question_1" required><option value="">Select</option><option value="0">TypeScript</option></select></label>
      <label>Cover letter<textarea name="cover_letter_text"></textarea></label>
      <label>Consent<input name="consent" type="checkbox" required></label>
      <button type="submit">Submit application</button>
      </form><script>document.querySelector('form').addEventListener('submit', e => {e.preventDefault(); document.body.innerHTML='<h1>Thank you for applying!</h1>';});</script>`;
    await page.setContent(html);
    assert.deepEqual(await fillApplication(page, fixture, files), []);
    assert.equal(await page.locator('[name="email"]').inputValue(), "test@example.invalid");
    assert.equal(await page.locator('[name="question_1"]').inputValue(), "0");
    assert.equal(await page.locator('[name="consent"]').isChecked(), true);
    assert.equal(await page.locator('[name="resume"]').evaluate(async el => (el as HTMLInputElement).files![0].text()), bytes.toString());
    const statuses: SubmissionStatus[] = [];
    const result = await finishApplication(page, async status => { statuses.push(status); }, [], 20);
    assert.equal(result, "submitted");
    assert.deepEqual(statuses, ["submitting"]);
    assert.equal(await isConfirmed(page), true);

    await page.setContent(html + '<h2>Thank you for applying!</h2>');
    assert.equal(await isConfirmed(page), false, "A phrase in the page is not confirmation while the form remains visible");
    const missing = structuredClone(fixture);
    missing.job.sections[0].questions[0].fields[0].name = "unknown";
    missing.job.sections[0].questions[0].label = "Missing question";
    assert((await fillApplication(page, missing, files)).includes("Missing question"));
    const manualStates: SubmissionStatus[] = [];
    assert.equal(await finishApplication(page, async status => { manualStates.push(status); }, ["Missing question"], 20), "needs_verification");
    assert.deepEqual(manualStates, ["needs_input"]);
    assert.equal(await page.locator('form').count(), 1, "Unmatched fields must prevent automatic submission");

    // Reproduce Greenhouse's SSR inputs: visible before the async form client
    // resets them and attaches its handlers. Cover text is initially collapsed.
    await page.route("https://hydration.example/**", async route => {
      if (route.request().url().endsWith("client.js")) {
        await new Promise(resolve => setTimeout(resolve, 300));
        return route.fulfill({ contentType: "application/javascript", body: `
          document.querySelector('form').reset();
          document.querySelector('[data-testid="cover_letter-text"]').onclick = () => document.querySelector('#cover_letter_text').hidden = false;
          document.querySelector('#resume').onchange = e => setTimeout(() => document.querySelector('#attached').textContent = e.target.files[0].name, 100);
        ` });
      }
      return route.fulfill({ contentType: "text/html", body: `<form>
        <input id="first_name"><input id="email"><div class="file-upload"><input type="file" id="resume"><span id="attached"></span></div>
        <select id="question_1"><option value="0">TypeScript</option></select>
        <button type="button" data-testid="cover_letter-text">Enter manually</button>
        <textarea id="cover_letter_text" hidden></textarea><input type="checkbox" id="consent">
        </form><script async src="/client.js"></script>` });
    });
    await page.goto("https://hydration.example/", { waitUntil: "domcontentloaded" });
    assert.deepEqual(await fillApplication(page, fixture, files), []);
    assert.equal(await page.locator('#first_name').inputValue(), "Test");
    assert.equal(await page.locator('#email').inputValue(), "test@example.invalid");
    assert.equal(await page.locator('#cover_letter_text').inputValue(), "A short cover letter.");
    assert.equal(await page.locator('#attached').textContent(), "fixture.pdf", "Upload client receives the file, not just the native input");
    console.log("PASS: required fields, options, changed forms, exact PDF bytes, text/select/checkbox fill, confirmed submission, and manual handoff without resubmission.");
  } finally { await browser.close(); }
}
if (process.argv[1]?.endsWith("submission.test.ts")) main().catch(error => { console.error(error); process.exitCode = 1; });
