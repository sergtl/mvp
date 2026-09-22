import { z } from "zod";
import { isCountry, isScope, scopeLabel } from "../geo/regions";

// Facts the user states about themselves that a CV cannot supply. Every field
// has an "unknown" value (empty string, null, "ask"); unknown never becomes a
// guess when answering a form.

export const ENGAGEMENTS = [
  "employee",
  "employee_sponsored",
  "contractor",
  "eor",
] as const;

export type Engagement = (typeof ENGAGEMENTS)[number];

export const engagementLabels: Record<Engagement, string> = {
  employee: "Employee (authorized to work, no sponsorship)",
  employee_sponsored: "Employee (needs visa sponsorship)",
  contractor: "B2B contractor (via my own entity)",
  eor: "Employee via employer-of-record (EOR)",
};

export const DEMOGRAPHIC_KEYS = [
  "gender",
  "hispanic",
  "race",
  "veteran",
  "disability",
  "sexualOrientation",
] as const;

export type DemographicKey = (typeof DEMOGRAPHIC_KEYS)[number];

export const demographicLabels: Record<DemographicKey, string> = {
  gender: "Gender",
  hispanic: "Hispanic / Latino",
  race: "Race / ethnicity",
  veteran: "Veteran status",
  disability: "Disability status",
  sexualOrientation: "Sexual orientation",
};

const country = z
  .string()
  .refine((value) => value === "" || isCountry(value), "Choose a country.");
const currency = z
  .string()
  .regex(/^([A-Z]{3})?$/, "Use a 3-letter code such as USD.");
const amount = z.number().nonnegative().max(1_000_000_000).nullable();
const link = z
  .string()
  .max(300)
  .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), {
    message: "Enter a full link starting with https://",
  });
const stance = z.object({
  mode: z.enum(["ask", "decline", "answer"]),
  answer: z.string().max(200),
});

export const profileSchema = z.object({
  eligibility: z.object({
    residenceCountry: country,
    citizenships: z
      .array(z.string().refine(isCountry, "Choose a country."))
      .max(10),
    // "Jobs in <scope> I can take in these ways."
    routes: z
      .array(
        z.object({
          scope: z.string().refine(isScope, "Choose a country or region."),
          how: z.array(z.enum(ENGAGEMENTS)).min(1, "Choose at least one."),
        }),
      )
      .max(30),
    contractorEntity: z.object({
      country,
      type: z.string().max(100),
      invoiceCurrency: currency,
    }),
    // One sentence in the user's own words, used only in cover letters.
    contractorNote: z.string().max(300),
    mentionContractorNote: z.enum(["when_unclear", "always", "never"]),
  }),
  compensation: z.object({
    employee: z.object({ min: amount, max: amount, currency }),
    contractor: z.object({
      amount,
      unit: z.enum(["hour", "day", "month", "year"]),
      currency,
    }),
  }),
  projects: z
    .array(
      z.object({
        name: z.string().max(120),
        url: link,
        summary: z.string().max(800),
        tech: z.string().max(200),
        role: z.string().max(200),
      }),
    )
    .max(10),
  availability: z.object({ startDate: z.string().max(200) }),
  relocation: z.enum(["ask", "yes", "no"]),
  links: z.object({ linkedin: link, github: link, portfolio: link }),
  demographics: z.object({
    gender: stance,
    hispanic: stance,
    race: stance,
    veteran: stance,
    disability: stance,
    sexualOrientation: stance,
  }),
  consents: z.object({
    dataProcessing: z.enum(["ask", "agree"]),
    demographicData: z.enum(["ask", "agree"]),
  }),
});

export type Profile = z.infer<typeof profileSchema>;

const askStance = { mode: "ask", answer: "" } as const;

export const emptyProfile: Profile = {
  eligibility: {
    residenceCountry: "",
    citizenships: [],
    routes: [],
    contractorEntity: { country: "", type: "", invoiceCurrency: "" },
    contractorNote: "",
    mentionContractorNote: "when_unclear",
  },
  compensation: {
    employee: { min: null, max: null, currency: "" },
    contractor: { amount: null, unit: "month", currency: "" },
  },
  projects: [],
  availability: { startDate: "" },
  relocation: "ask",
  links: { linkedin: "", github: "", portfolio: "" },
  demographics: {
    gender: askStance,
    hispanic: askStance,
    race: askStance,
    veteran: askStance,
    disability: askStance,
    sexualOrientation: askStance,
  },
  consents: { dataProcessing: "ask", demographicData: "ask" },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Fill anything missing from `stored` (recursively) with the defaults.
function withDefaults(defaults: unknown, stored: unknown): unknown {
  if (!isRecord(defaults) || !isRecord(stored))
    return stored === undefined ? defaults : stored;

  return Object.fromEntries(
    [...new Set([...Object.keys(defaults), ...Object.keys(stored)])].map(
      (key) => [key, withDefaults(defaults[key], stored[key])],
    ),
  );
}

// Stored rows may predate newer fields: fill them from the empty profile.
export function parseStoredProfile(stored: unknown): Profile | null {
  const parsed = profileSchema.safeParse(withDefaults(emptyProfile, stored));

  return parsed.success ? parsed.data : null;
}

// Projects the user has actually filled in (the form keeps blank rows while typing).
export const usableProjects = (profile: Profile) =>
  profile.projects.filter((project) => project.name.trim() || project.summary.trim());

export const routeScopes = (profile: Profile, how: Engagement) =>
  profile.eligibility.routes
    .filter((route) => route.how.includes(how))
    .map((route) => route.scope);

export function summarizeRoutes(routes: Profile["eligibility"]["routes"]) {
  const parts = (
    [
      ["employee", "as an employee"],
      ["employee_sponsored", "as an employee with visa sponsorship"],
      ["contractor", "as a B2B contractor"],
      ["eor", "through an employer-of-record"],
    ] as const
  ).flatMap(([how, phrase]) => {
    const scopes = routes
      .filter((route) => route.how.includes(how))
      .map((route) => scopeLabel(route.scope));

    return scopes.length ? [`${scopes.join(", ")} ${phrase}`] : [];
  });

  return parts.length
    ? `You can take jobs in ${parts.join("; jobs in ")}.`
    : "No routes yet. Questions about where you can work will be left for you to answer.";
}
