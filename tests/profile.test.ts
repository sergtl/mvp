import assert from "node:assert/strict";
import OpenAI from "openai";
import { COUNTRIES, COUNTRY_CODES, countryName, scopeCovers, scopesInText } from "../lib/geo/regions";
import { applyGeneratedAnswers } from "../lib/jobs/answer-draft";
import { generateJobAnswers } from "../lib/jobs/generate-answers";
import type { ImportedJob, JobField } from "../lib/jobs/greenhouse";
import { resolveFromProfile } from "../lib/profile/resolve";
import {
  emptyProfile,
  parseStoredProfile,
  profileSchema,
  summarizeRoutes,
  type Profile,
} from "../lib/profile/schema";

const yesNoOptions = [
  { value: "1", label: "Yes" },
  { value: "0", label: "No" },
];
const select = (options = yesNoOptions): JobField => ({
  name: "q",
  type: "multi_value_single_select",
  options,
});
const text: JobField = { name: "q", type: "input_text", options: [] };
const ask = (label: string, field: JobField = select(), required = true) => ({
  label,
  description: "",
  required,
  fields: [field],
});

const eeo = [
  { value: "1", label: "Male" },
  { value: "2", label: "Female" },
  { value: "3", label: "Decline To Self Identify" },
];

const job: ImportedJob = {
  id: "1",
  title: "Engineer",
  company: "Acme",
  location: "Remote",
  description: "Build things.",
  sourceURL: "https://job-boards.greenhouse.io/acme/jobs/1",
  sections: [
    {
      title: "Application",
      description: "",
      questions: [
        ask("Are you legally authorized to work in the United States?"), // 0
        ask("Will you now or in the future require visa sponsorship to work in the United States?"), // 1
        ask("Are you authorized to work in the European Union?"), // 2
        ask("What are your salary expectations?", text), // 3
        ask("Are you open to working as a B2B contractor?"), // 4
        ask("LinkedIn Profile", text, false), // 5
        ask("Are you authorized to work in Canada?"), // 6
        ask("Are you legally authorized to work?"), // 7
        ask("Do you currently reside in the United States?"), // 8
        ask("Will you require sponsorship to work in Georgia?"), // 9
        ask("Earliest start date", text), // 10
        ask("Are you willing to relocate?"), // 11
        ask("Are you authorized to work in the US without visa sponsorship?"), // 12
        ask("Are you authorized to work in the US, and will you require sponsorship?"), // 13
        ask("GitHub or LinkedIn", text, false), // 14
        ask("Which country do you live in?", text), // 15
        {
          ...ask("Will you require sponsorship to work in the EU?"),
          fields: [
            { name: "hidden", type: "input_hidden", options: [] },
            select(),
          ],
        }, // 16
      ],
    },
    {
      title: "Equal opportunity",
      description: "",
      questions: [
        ask("Gender", select(eeo), false), // 1-0
        ask("Are you Hispanic/Latino?", select(yesNoOptions), false), // 1-1
        {
          label: "I consent to the processing of my application data.",
          description: "",
          required: true,
          fields: [
            { name: "gdpr_processing_consent_given", type: "consent", options: [] },
          ],
        }, // 1-2
      ],
    },
  ],
};

const cv = {
  contact: {
    name: "Jane",
    email: "j@example.com",
    phone: "",
    location: "",
    links: ["https://www.linkedin.com/in/jane", "github.com/jane"],
  },
  summary: "",
  experience: [],
  education: [],
  skills: [],
  languages: [],
};

const withProfile = (change: (p: Profile) => void) => {
  const profile = structuredClone(emptyProfile);
  change(profile);
  return profile;
};

const resolved = (profile: Profile) =>
  Object.fromEntries(
    resolveFromProfile(job, profile, cv).map((a) => [a.id, a.value]),
  );

function main() {
  // Geography
  assert.deepEqual(scopesInText("Are you authorized to work in the United States?"), ["US"]);
  assert.deepEqual(scopesInText("Can you tell us why?"), [], "'us' is not the US");
  assert.deepEqual(scopesInText("US-based role"), ["US"]);
  assert.deepEqual(scopesInText("Located in the EU"), ["EU"]);
  assert.deepEqual(scopesInText("Papua New Guinea"), ["PG"]);
  assert.deepEqual(scopesInText("Northern Ireland"), ["GB"]);
  assert.deepEqual(scopesInText("Nigeria"), ["NG"], "Nigeria is not Niger");
  assert.deepEqual(scopesInText("Georgia").sort(), ["GE", "US"], "Georgia is ambiguous");
  assert.deepEqual(scopesInText("Türkiye or Turkey"), ["TR"]);
  assert(scopeCovers("EU", "DE") && scopeCovers("EU", "EU") && scopeCovers("WORLDWIDE", "US"));
  assert(!scopeCovers("DE", "EU") && !scopeCovers("EU", "GB") && !scopeCovers("US", "NOPE"));
  assert(scopeCovers("EMEA", "GE"));
  assert.deepEqual(scopesInText("Côte d'Ivoire"), ["CI"]);
  assert.deepEqual(scopesInText("Åland"), [], "Only full names match");
  // Names are a fixed table, so every runtime renders and matches the same text.
  assert(COUNTRY_CODES.every((code) => countryName(code) !== code), "every country has a name");
  assert.equal(COUNTRIES.length, COUNTRY_CODES.length);
  assert.deepEqual(COUNTRIES.slice(0, 3).map((c) => c.code), ["AF", "AX", "AL"], "stable, accent-insensitive order");
  for (const { code, name } of COUNTRIES)
    if (code !== "GE") assert(scopesInText(name).includes(code), `${name} matches itself`);

  // Schema
  assert(profileSchema.safeParse(emptyProfile).success);
  assert(!profileSchema.safeParse({ ...emptyProfile, eligibility: { ...emptyProfile.eligibility, routes: [{ scope: "Narnia", how: ["employee"] }] } }).success);
  assert(!profileSchema.safeParse({ ...emptyProfile, links: { ...emptyProfile.links, linkedin: "javascript:alert(1)" } }).success);
  assert.deepEqual(parseStoredProfile({}), emptyProfile, "Missing sections fall back to empty");
  assert.equal(parseStoredProfile({ relocation: "maybe" }), null);
  assert.match(
    summarizeRoutes([
      { scope: "EU", how: ["employee"] },
      { scope: "WORLDWIDE", how: ["contractor"] },
    ]),
    /European Union as an employee; jobs in Worldwide as a B2B contractor/,
  );

  // An empty profile answers nothing except CV-derived links.
  assert.deepEqual(resolved(emptyProfile), { "0-5-0": "https://www.linkedin.com/in/jane" });

  // EU employee + worldwide contractor, living in Georgia (the ambiguous name).
  const contractor = withProfile((p) => {
    p.eligibility.residenceCountry = "GE";
    p.eligibility.routes = [
      { scope: "EU", how: ["employee"] },
      { scope: "WORLDWIDE", how: ["contractor"] },
    ];
    p.compensation.employee = { min: 100000, max: 120000, currency: "EUR" };
    p.compensation.contractor = { amount: 8000, unit: "month", currency: "EUR" };
    p.availability.startDate = "Two weeks after an offer";
    p.demographics.gender = { mode: "decline", answer: "" };
    p.demographics.hispanic = { mode: "answer", answer: "no" };
    p.consents.dataProcessing = "agree";
  });
  const a = resolved(contractor);

  assert.equal(a["0-0-0"], undefined, "Contractor abroad is never auto-answered on US authorization");
  assert.equal(a["0-1-0"], undefined, "...nor on US sponsorship");
  assert.equal(a["0-2-0"], "1", "EU authorization covered by the EU route");
  assert.equal(a["0-3-0"], "EUR 100,000–120,000 per year as an employee, or EUR 8,000 per month as a B2B contractor");
  assert.equal(a["0-4-0"], "1", "Open to B2B when a contractor route exists");
  assert.equal(a["0-6-0"], undefined, "Canada is not covered");
  assert.equal(a["0-7-0"], undefined, "No named country means no answer");
  assert.equal(a["0-8-0"], "0", "Residence is a plain fact, so No is safe");
  assert.equal(a["0-9-0"], undefined, "Georgia could be the US state");
  assert.equal(a["0-10-0"], "Two weeks after an offer");
  assert.equal(a["0-11-0"], undefined, "Relocation stays unanswered while set to ask");
  assert.equal(a["0-12-0"], undefined);
  assert.equal(a["0-13-0"], undefined, "Two questions in one field");
  assert.equal(a["0-14-0"], undefined, "Two links in one field");
  assert.equal(a["0-15-0"], "Georgia");
  assert.equal(a["0-16-1"], "0", "A hidden sibling field does not block resolution");
  assert.equal(a["1-0-0"], "3", "Decline maps to the decline option");
  assert.equal(a["1-1-0"], "0", "Stated answer maps to the matching option");
  assert.equal(a["1-2-0"], true, "Only an explicit agree ticks consent");

  // Employee authorized in the US.
  const american = resolved(withProfile((p) => {
    p.eligibility.routes = [{ scope: "US", how: ["employee"] }];
  }));
  assert.equal(american["0-0-0"], "1");
  assert.equal(american["0-1-0"], "0");
  assert.equal(american["0-12-0"], "1");
  assert.equal(american["0-2-0"], undefined);
  assert.equal(american["0-4-0"], undefined, "No contractor route: not answered, and never an auto No");

  // Needs sponsorship for the US.
  const sponsored = resolved(withProfile((p) => {
    p.eligibility.routes = [{ scope: "US", how: ["employee_sponsored"] }];
  }));
  assert.equal(sponsored["0-1-0"], "1");
  assert.equal(sponsored["0-0-0"], undefined, "Sponsored is not authorized");

  // Decline needs exactly one matching option; free-form options are never used.
  const ambiguous = structuredClone(job);
  ambiguous.sections[1].questions[0].fields[0].options = [
    ...eeo,
    { value: "4", label: "Prefer not to say" },
  ];
  assert.equal(
    resolveFromProfile(ambiguous, contractor).some((r) => r.id === "1-0-0"),
    false,
  );
  const freeForm = structuredClone(job);
  freeForm.sections[1].questions[0].fields[0].options = [
    { value: "1", label: "Male" },
    { value: "9", label: "I prefer not to say", freeForm: true },
  ];
  assert.equal(
    resolveFromProfile(freeForm, contractor).some((r) => r.id === "1-0-0"),
    false,
  );

  // A figure without a currency is not used.
  assert.equal(
    resolved(withProfile((p) => { p.compensation.employee.min = 90000; }))["0-3-0"],
    undefined,
  );

  // Integration: resolved questions never reach the model and are marked.
  return integration(contractor);
}

async function integration(profile: Profile) {
  const withCover = structuredClone(job);
  withCover.sections[0].questions.push(ask("Cover letter", { name: "cover_letter_text", type: "textarea", options: [] }, false));
  const coverId = `0-${withCover.sections[0].questions.length - 1}-0`;
  let sent: { id: string }[] = [];
  const reply = { answers: [{ id: coverId, value: "I build web apps.", selectedValues: [], needsInput: false, reason: "" }] };
  const client = new OpenAI({
    apiKey: "test-only",
    maxRetries: 0,
    fetch: async (_url, init) => {
      sent = JSON.parse(JSON.parse(String(init?.body)).input[1].content).targets;
      return new Response(
        JSON.stringify({ id: "r", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(reply), annotations: [] }] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const result = await generateJobAnswers(withCover, cv, client, profile);
  const profileIds = result.answers.filter((x) => x.source === "profile").map((x) => x.id);

  assert(profileIds.includes("0-2-0") && profileIds.includes("1-2-0"));
  assert.equal(result.answers.find((x) => x.id === coverId)?.source, undefined);
  assert(sent.some((t) => t.id === coverId));
  assert(!sent.some((t) => profileIds.includes(t.id)), "Profile-answered questions are not sent to the model");
  assert(!result.skipped.some((s) => ["0-2", "0-3", "0-4", "1-2"].includes(s.questionKey)));

  const applied = applyGeneratedAnswers({}, {}, result);
  assert.equal(applied.answers["1-2-0"], true);
  assert(applied.provenance["0-2"] && applied.provenance["1-2"]);
  const edited = applyGeneratedAnswers({ "0-2-0": "0" }, {}, result);
  assert.equal(edited.answers["0-2-0"], "0", "A user's own answer is never overwritten");
  assert(!edited.provenance["0-2"]);

  console.log("PASS: geography, schema, deterministic profile answers, ambiguity and safety rules, and model bypass.");
}

Promise.resolve()
  .then(main)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
