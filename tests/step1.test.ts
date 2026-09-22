import assert from "node:assert/strict";
import OpenAI from "openai";
import { memoryFromSubmission, planMemory, type MemoryEntry } from "../lib/answers/plan";
import { answerTargets } from "../lib/jobs/answers";
import { generateJobAnswers, regenerateAnswer, RegenerateError } from "../lib/jobs/generate-answers";
import type { ImportedJob, JobQuestion } from "../lib/jobs/greenhouse";
import { cleanRequirements, noRequirements } from "../lib/jobs/requirements";
import { setupSteps } from "../lib/onboarding/steps";
import { checkEligibility } from "../lib/profile/eligibility";
import { emptyProfile, type Profile } from "../lib/profile/schema";

const q = (label: string, type = "textarea", required = true): JobQuestion => ({
  label, description: "", required, fields: [{ name: label, type, options: [] }],
});
const job: ImportedJob = {
  id: "1", title: "Engineer", company: "Acme", location: "Remote", description: "Build things.",
  sourceURL: "https://job-boards.greenhouse.io/acme/jobs/1",
  sections: [{ title: "Application", description: "", questions: [
    q("Cover letter"), q("Why do you want to work at Acme?"), q("Describe a project you're proud of."),
    q("Anything else?", "textarea", false), q("Are you authorized to work in the US?", "multi_value_single_select"),
  ] }],
};
const cv = { contact: { name: "Jane", email: "j@example.com", phone: "", location: "", links: [] }, summary: "", experience: [], education: [], skills: [], languages: [] };
const profile = (change: (p: Profile) => void) => { const p = structuredClone(emptyProfile); change(p); return p; };

const memory = (over: Partial<MemoryEntry>): MemoryEntry => ({
  id: "m", questionKey: "describe a project you re proud of", question: "Describe a project you're proud of.", kind: "text",
  answer: "I built a job tool that fills forms from my CV.", company: "Globex", jobTitle: "Dev", sourceURL: "https://job-boards.greenhouse.io/globex/jobs/9",
  createdAt: new Date(), ...over,
});

async function main() {
  // --- checkEligibility
  const contractor = profile((p) => { p.eligibility.residenceCountry = "GE"; p.eligibility.routes = [{ scope: "EU", how: ["employee"] }, { scope: "WORLDWIDE", how: ["contractor"] }]; });
  const req = (over: object) => ({ ...noRequirements, ...over }) as typeof noRequirements;
  const usAuth = { scopes: ["US"], quote: "must be authorized to work in the US" };
  assert.equal(checkEligibility(contractor, req({ authorization: usAuth })).verdict, "unclear", "contractor, policy unknown");
  assert.equal(checkEligibility(contractor, req({ authorization: usAuth, contractors: { policy: "accepted", quote: "we hire contractors" } })).verdict, "eligible");
  assert.equal(checkEligibility(contractor, req({ authorization: usAuth, contractors: { policy: "not_accepted", quote: "employees only" } })).verdict, "blocked");
  assert.equal(checkEligibility(contractor, req({ authorization: { scopes: ["EU"], quote: "authorized in the EU" } })).verdict, "eligible");
  assert.equal(checkEligibility(contractor, req({ residency: { scopes: ["US"], quote: "Remote, US only" } })).verdict, "blocked");
  assert.equal(checkEligibility(contractor, req({ residency: { scopes: ["EMEA"], quote: "Remote, EMEA" } })).verdict, "eligible", "Georgia is inside EMEA");
  assert.equal(checkEligibility(profile((p) => { p.eligibility.residenceCountry = "TR"; }), req({ residency: { scopes: ["EUROPE"], quote: "based in Europe" } })).verdict, "unclear", "fuzzy region never blocks");
  assert.equal(checkEligibility(profile((p) => { p.eligibility.routes = [{ scope: "US", how: ["employee_sponsored"] }]; }), req({ authorization: usAuth })).verdict, "unclear", "sponsorship not stated");
  assert.equal(checkEligibility(emptyProfile, req({ authorization: usAuth })).verdict, "unclear", "empty profile is never eligible by default");
  assert.equal(checkEligibility(profile((p) => { p.eligibility.residenceCountry = "GE"; }), req({ authorization: usAuth })).verdict, "unclear", "residence only, no routes");
  assert.equal(checkEligibility(emptyProfile).verdict, "eligible", "no requirements stated");
  assert.equal(checkEligibility(profile((p) => { p.eligibility.citizenships = ["DE"]; }), req({ citizenship: { scopes: ["US"], quote: "US citizens only" } })).verdict, "blocked");

  // --- a claim without a verbatim quote in the posting is discarded
  const posting = "We are hiring. You must be authorized to work in the US. Contractors welcome.";
  const cleaned = cleanRequirements({
    ...noRequirements,
    authorization: usAuth,
    residency: { scopes: ["DE"], quote: "must live in Germany" },
    contractors: { policy: "accepted", quote: "Contractors welcome" },
    sponsorship: { offered: "offered", quote: "we sponsor visas" },
  }, posting);
  assert.deepEqual(cleaned.authorization.scopes, ["US"]);
  assert.deepEqual(cleaned.residency, { scopes: [], quote: "" }, "invented quote dropped");
  assert.equal(cleaned.contractors.policy, "accepted");
  assert.equal(cleaned.sponsorship.offered, "unknown", "invented sponsorship dropped");
  assert.deepEqual(cleanRequirements({ ...noRequirements, residency: { scopes: ["Narnia"], quote: "Remote, US only" } }, "Remote, US only").residency.scopes, [], "unknown scope dropped");

  // --- answer memory: what is saved, and what is reused
  const filled = { job, answers: { "0-0-0": "I build web apps and ship them.", "0-2-0": "I built a job tool that fills forms from my CV.", "0-3-0": "short" }, freeText: {}, attachments: {} };
  const saved = memoryFromSubmission(filled, []);
  assert.deepEqual(saved.map((m) => [m.kind, m.questionKey]), [["cover_letter", "cover letter"], ["text", "describe a project you re proud of"]], "long-form only; too-short and unanswered skipped");
  const targets = answerTargets(job, { includeOptional: true });
  const plan = planMemory(job, targets, [memory({}), memory({ id: "c", kind: "cover_letter", questionKey: "cover letter", answer: "Cover letter for Globex." })]);
  assert.deepEqual(plan.reuse.map((r) => r.id), ["0-2-0"], "company-neutral question reused");
  assert(plan.examples.some((e) => e.kind === "cover_letter"), "cover letter shown only as an example");
  assert(!plan.reuse.some((r) => r.id === "0-0-0" || r.id === "0-1-0"), "never copy cover letters or 'why us'");
  assert.equal(planMemory(job, targets, [memory({ answer: "At Globex I built a tool." })]).reuse.length, 0, "answer naming another company is not reused");
  assert.equal(planMemory(job, targets, [memory({ sourceURL: job.sourceURL })]).reuse.length, 0, "not from the same job");

  // --- generation: memory + projects + contractor statement, with a fake model
  let sent: { targets: { id: string }[]; applicant: { projects: unknown[]; contractorStatement: string }; styleExamples: unknown[]; revision?: { instruction: string } } | null = null;
  let system = "";
  const reply = (id: string) => ({ answers: [{ id, value: "Draft.", selectedValues: [], needsInput: false, reason: "" }] });
  let nextId = "0-0-0";
  const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    system = body.input[0].content; sent = JSON.parse(body.input[1].content);
    return new Response(JSON.stringify({ id: "r", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(reply(nextId)), annotations: [] }] }] }), { status: 200, headers: { "content-type": "application/json" } });
  } });
  const withProjects = profile((p) => {
    p.eligibility.routes = [{ scope: "WORLDWIDE", how: ["contractor"] }];
    p.eligibility.contractorNote = "I work as an independent contractor through my own company.";
    p.projects = [{ name: "FormFiller", url: "https://example.com/ff", summary: "Fills job forms from a CV.", tech: "TypeScript", role: "Author" }, { name: "", url: "", summary: "", tech: "", role: "" }];
  });
  const result = await generateJobAnswers(job, cv, client, withProjects, { memory: [memory({}), memory({ id: "c", kind: "cover_letter", questionKey: "cover letter" })] });
  assert.equal(result.answers.find((a) => a.id === "0-2-0")?.source, "memory");
  assert.equal(result.answers.find((a) => a.id === "0-2-0")?.from, "Globex");
  assert(!sent!.targets.some((t) => t.id === "0-2-0"), "reused question not sent to the model");
  assert.equal(sent!.applicant.projects.length, 1, "blank project rows are not sent");
  assert.equal(sent!.applicant.contractorStatement, "I work as an independent contractor through my own company.", "unknown policy -> mentioned");
  assert(sent!.styleExamples.length >= 1);
  assert.match(system, /applicant profile/);
  await generateJobAnswers(job, cv, client, withProjects, { contractors: "accepted" });
  assert.equal(sent!.applicant.contractorStatement, "", "posting welcomes contractors -> not mentioned");
  await generateJobAnswers(job, cv, client, profile((p) => { Object.assign(p, withProjects); p.eligibility.mentionContractorNote = "always"; }), { contractors: "accepted" });
  assert.equal(sent!.applicant.contractorStatement, withProjects.eligibility.contractorNote, "always -> mentioned");
  await generateJobAnswers(job, cv, client, profile((p) => { Object.assign(p, withProjects); p.eligibility.mentionContractorNote = "never"; }));
  assert.equal(sent!.applicant.contractorStatement, "");

  // --- regenerate one question
  nextId = "0-3-0";
  const regenerated = await regenerateAnswer(job, cv, { questionKey: "0-3", instruction: "shorter", current: "old" }, client, withProjects);
  assert.equal(regenerated.answers[0].id, "0-3-0", "optional question can be regenerated");
  assert.equal(sent!.revision?.instruction, "shorter");
  assert.equal(sent!.targets.length, 1);
  await assert.rejects(regenerateAnswer(job, cv, { questionKey: "0-4", instruction: "x", current: "" }, client), (e) => e instanceof RegenerateError && e.code === "manual", "personal question refused");
  await assert.rejects(regenerateAnswer(job, cv, { questionKey: "9-9", instruction: "x", current: "" }, client), (e) => e instanceof RegenerateError && e.code === "not_found");
  const stated = profile((p) => { p.availability.startDate = "now"; });
  const startJob = { ...job, sections: [{ ...job.sections[0], questions: [q("Earliest start date", "input_text")] }] };
  await assert.rejects(regenerateAnswer(startJob, cv, { questionKey: "0-0", instruction: "x", current: "" }, client, stated), (e) => e instanceof RegenerateError);

  // --- onboarding steps
  const base = { cv: null, parse: null, reviewed: false, profile: { saved: false, complete: false } };
  assert.equal(setupSteps(base).steps[0].state, "active");
  const docx = setupSteps({ ...base, cv: { id: "1", filename: "cv.docx", isPdf: false } });
  assert.equal(docx.steps[0].state, "problem"); assert.match(docx.steps[0].detail, /PDF/);
  const stuck = setupSteps({ ...base, cv: { id: "1", filename: "cv.pdf", isPdf: true }, parse: { status: "queued", errorCode: null, stuck: true } });
  assert.equal(stuck.steps[1].state, "problem"); assert.match(stuck.steps[1].detail, /pnpm worker/);
  const done = { cv: { id: "1", filename: "cv.pdf", isPdf: true }, parse: { status: "completed" as const, errorCode: null, stuck: false }, reviewed: false, profile: { saved: true, complete: true } };
  assert.equal(setupSteps(done).complete, true, "review is optional");
  assert.equal(setupSteps({ ...done, profile: { saved: true, complete: false } }).complete, false);
  assert.equal(setupSteps({ ...done, parse: { status: "processing", errorCode: null, stuck: false } }).complete, false);

  console.log("PASS: eligibility verdicts, quote verification, answer memory, generation context, regenerate, onboarding.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
