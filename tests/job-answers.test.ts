import assert from "node:assert/strict";
import OpenAI from "openai";
import { answerTargets, validateGeneratedAnswers } from "../lib/jobs/answers";
import { applyGeneratedAnswers, attachResume, resumeFields } from "../lib/jobs/answer-draft";
import { generateJobAnswers } from "../lib/jobs/generate-answers";
import type { ImportedJob, JobQuestion } from "../lib/jobs/greenhouse";

async function main() {
  const question = (label: string, type = "textarea", required = true): JobQuestion => ({
    label, description: "", required, fields: [{ name: label, type, options: [] }],
  });
  const job: ImportedJob = {
    id: "1", title: "Engineer", company: "Acme", location: "Remote", description: "Build web applications.",
    sourceURL: "https://job-boards.greenhouse.io/acme/jobs/1",
    sections: [{ title: "Application", description: "", questions: [
      question("Email", "input_text"), question("Cover letter", "textarea", false),
      question("Why Acme?", "textarea", false), question("Website", "input_text", false),
      question("Do you require visa sponsorship?", "multi_value_single_select"),
      { ...question("Resume"), fields: [{ name: "resume", type: "input_file", options: [] }, { name: "resume_text", type: "textarea", options: [] }] },
      { ...question("Skills", "multi_value_multi_select"), fields: [{ name: "skills", type: "multi_value_multi_select", options: [{ value: "0", label: "TypeScript" }, { value: "1", label: "Other", freeForm: true }] }] },
      question("Cover letter attachment", "input_file", false), question("I agree to the terms", "consent"),
    ] }],
  };
  const targets = answerTargets(job);
  assert(!targets.some(t => t.id === "0-3-0"), "Skip unrelated optional questions");
  assert(targets.some(t => t.id === "0-1-0"));
  assert(targets.some(t => t.id === "0-2-0"));
  assert(targets.some(t => t.id === "0-5-1"), "Prefer resume text alternative");
  const entry = (id: string, value = "Draft", selectedValues: string[] = []) => ({ id, value, selectedValues, needsInput: false, reason: "" });
  const generated = { answers: [entry("0-0-0", "jane@example.com"), entry("0-1-0"), entry("0-4-0", "Yes"), entry("0-6-0", "", ["0"]), entry("0-7-0"), entry("0-8-0", "Yes"), entry("invalid-id")] };
  const result = validateGeneratedAnswers(targets, generated);
  assert(!result.answers.some(a => a.id === "0-4-0" || a.id === "0-8-0" || a.id === "invalid-id"));
  assert.deepEqual(result.answers.find(a => a.id === "0-6-0")?.value, ["0"]);
  assert.equal(result.answers.find(a => a.id === "0-7-0")?.fileText, "Draft");
  for (const options of [["invented"], ["1"]]) {
    assert.equal(validateGeneratedAnswers(targets.filter(t => t.id === "0-6-0"), { answers: [entry("0-6-0", "", options)] }).answers.length, 0);
  }
  assert.equal(validateGeneratedAnswers(targets, { answers: [entry("0-0-0"), entry("0-0-0")] }).answers.length, 0, "Reject ambiguous duplicate IDs");
  const file = new File(["original"], "cv.pdf");
  assert.deepEqual(resumeFields(job).map(field => field.id), ["0-5-0"], "Only resume file fields, never cover letters");
  const attached = attachResume(job, { "0-5-1": "old resume text" }, {}, "saved-cv-id", file);
  assert.equal(attached.answers["0-5-0"], file);
  assert.equal(attached.answers["0-5-1"], undefined);
  assert.deepEqual(attached.attachments["0-5-0"], { cvId: "saved-cv-id", filename: "cv.pdf", fieldName: "resume" });
  const replacement = new File(["replacement"], "new.pdf");
  assert.equal(attachResume(job, attached.answers, attached.attachments, "new-id", replacement).answers["0-5-0"], file);
  const replaced = attachResume(job, attached.answers, attached.attachments, "new-id", replacement, true);
  assert.equal(replaced.answers["0-5-0"], replacement);
  assert.equal(replaced.attachments["0-5-0"].cvId, "new-id");
  const generatedWithPDF = applyGeneratedAnswers(attached.answers, {}, { answers: [{ id: "0-5-1", value: "AI resume text" }], skipped: [] });
  assert.equal(generatedWithPDF.answers["0-5-0"], file);
  assert.equal(generatedWithPDF.answers["0-5-1"], undefined);
  const applied = applyGeneratedAnswers({ "0-0-0": "my edit", "0-5-0": file }, {}, {
    ...result, answers: [...result.answers, { id: "0-5-1", value: "CV text" }],
  });
  assert.equal(applied.answers["0-0-0"], "my edit");
  assert.equal(applied.answers["0-5-0"], file);
  assert.equal(applied.answers["0-5-1"], undefined);
  assert(applied.answers["0-7-0"] instanceof File);
  assert.equal(await (applied.answers["0-7-0"] as File).text(), "Draft");

  let calls = 0;
  let status = 200;
  let output: object = { id: "resp_test", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(generated), annotations: [] }] }] };
  const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.match(body.input[0].content, /Never invent/);
    const input = JSON.parse(body.input[1].content);
    assert.equal(input.cv.contact.name, "Jane Example");
    assert(!input.targets.some((t: { id: string }) => t.id === "0-4-0"));
    return new Response(JSON.stringify(output), { status, headers: { "content-type": "application/json" } });
  } });
  const cv = { contact: { name: "Jane Example", email: "jane@example.com", phone: "", location: "", links: [] }, summary: "Web developer", skills: ["TypeScript"], experience: [], education: [], languages: [] };
  assert.deepEqual(await generateJobAnswers(job, cv, client), result);
  output = { status: "incomplete", output: [] };
  await assert.rejects(generateJobAnswers(job, cv, client));
  output = { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "Cannot answer" }] }] };
  await assert.rejects(generateJobAnswers(job, cv, client));
  output = { error: { message: "Quota exceeded", code: "insufficient_quota" } };
  status = 429;
  const before = calls;
  await assert.rejects(generateJobAnswers(job, cv, client));
  assert.equal(calls, before + 1);
  console.log("PASS: question selection, consent exclusion, option validation, edit preservation, file drafts, structured AI transport, failures, and retry control.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
